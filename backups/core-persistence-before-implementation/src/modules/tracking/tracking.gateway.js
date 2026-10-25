const { Server } = require('socket.io');

const { verifyAccessToken } = require(
  '../auth/strategies/jwt.strategy'
);

const trackingService = require('./tracking.service');

let io = null;

const tripRoom = tripId => `trip:${tripId}`;

const initializeTrackingGateway = httpServer => {
  if (io) {
    throw new Error('Tracking gateway is already initialized');
  }

  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_ORIGIN || false,
      methods: ['GET', 'POST']
    }
  });

  // Authenticate every socket before accepting its connection.
  io.use((socket, next) => {
    try {
      const authorization =
        socket.handshake.auth?.token ||
        socket.handshake.headers.authorization ||
        '';

      const token = authorization.replace(/^Bearer\s+/i, '');

      if (!token) {
        return next(new Error('Access token is required'));
      }

      const payload = verifyAccessToken(token);

      socket.data.user = {
        id: Number(payload.sub),
        role: payload.role
      };

      next();
    } catch (error) {
      next(new Error('Invalid or expired access token'));
    }
  });

  io.on('connection', socket => {
    socket.on('tracking:subscribe', (payload, acknowledgement) => {
      const reply =
        typeof acknowledgement === 'function'
          ? acknowledgement
          : () => {};

      const tripId = payload?.tripId;

      if (typeof tripId !== 'string' || !tripId.trim()) {
        const result = {
          success: false,
          message: 'A valid trip ID is required'
        };

        reply(result);
        socket.emit('tracking:error', result);
        return;
      }

      // Reuse the service's patient-ownership and staff checks.
      const result = trackingService.getLatestLocation(
        tripId,
        socket.data.user
      );

      if (!result.success) {
        const errorResponse = {
          success: false,
          message: result.message
        };

        reply(errorResponse);
        socket.emit('tracking:error', errorResponse);
        return;
      }

      socket.join(tripRoom(tripId));

      const response = {
        success: true,
        data: result.data
      };

      reply(response);

      socket.emit('tracking:subscribed', response);

      if (result.data.location) {
        socket.emit('tracking:location', {
          tripId,
          location: result.data.location
        });
      }
    });

    socket.on('tracking:unsubscribe', (payload, acknowledgement) => {
      const reply =
        typeof acknowledgement === 'function'
          ? acknowledgement
          : () => {};

      const tripId = payload?.tripId;

      if (typeof tripId !== 'string' || !tripId.trim()) {
        reply({
          success: false,
          message: 'A valid trip ID is required'
        });
        return;
      }

      socket.leave(tripRoom(tripId));

      reply({
        success: true,
        message: 'Unsubscribed from trip tracking'
      });
    });

    // Socket.IO automatically removes disconnected sockets
    // from all rooms.
  });

  return io;
};

const broadcastLocation = (tripId, location) => {
  if (!io) {
    return false;
  }

  io.to(tripRoom(tripId)).emit('tracking:location', {
    tripId,
    location
  });

  return true;
};

module.exports = {
  initializeTrackingGateway,
  broadcastLocation
};
