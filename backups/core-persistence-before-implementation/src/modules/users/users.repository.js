const User = require('./entities/user.entity');

const users = [
  // Existing fictional patient account
  new User({
    id: 1,
    name: 'Demo User',
    email: 'demo@example.com',
    role: 'PATIENT'
  }),

  // Fictional dispatcher account for local development testing
  new User({
    id: 2,
    name: 'Demo Dispatcher',
    email: 'dispatcher@example.com',
    role: 'DISPATCHER'
  }),

  // Fictional administrator account for local development testing
  new User({
    id: 3,
    name: 'Demo Admin',
    email: 'admin@example.com',
    role: 'ADMIN'
  })
];

const findAll = () => users;

const findById = (id) =>
  users.find((user) => user.id === Number(id));

const findByEmail = (email) =>
  users.find(
    (user) => user.email.toLowerCase() === email.toLowerCase()
  );

const create = (data) => {
  const nextId = users.length
    ? Math.max(...users.map((user) => user.id)) + 1
    : 1;

  const user = new User({
    id: nextId,
    ...data
  });

  users.push(user);
  return user;
};

const update = (id, data) => {
  const user = findById(id);

  if (!user) return null;

  user.name = data.name;
  user.email = data.email;

  return user;
};

module.exports = {
  findAll,
  findById,
  findByEmail,
  create,
  update
};
