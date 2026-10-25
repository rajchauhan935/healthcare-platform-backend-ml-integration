const userService = require('./users.service');

const { validateCreateUser } = require('./dto/create-user.dto');
const { validateUpdateUser } = require('./dto/update-user.dto');

const getAllUsers = (req, res) => {
  return res.status(200).json({
    success: true,
    data: userService.getAllUsers()
  });
};

const getUserById = (req, res) => {
  const user = userService.getUserById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  return res.status(200).json({
    success: true,
    data: user
  });
};

const createUser = (req, res) => {
  const errors = validateCreateUser(req.body);

  if (errors.length) {
    return res.status(400).json({
      success: false,
      errors
    });
  }

  const result = userService.createUser(req.body);

  if (result.error) {
    return res.status(409).json({
      success: false,
      message: result.error
    });
  }

  return res.status(201).json({
    success: true,
    message: 'User created successfully',
    data: result.data
  });
};

const updateUser = (req, res) => {
  const errors = validateUpdateUser(req.body);

  if (errors.length) {
    return res.status(400).json({
      success: false,
      errors
    });
  }

  const result = userService.updateUser(req.params.id, req.body);

  if (result.error) {
    return res.status(result.status).json({
      success: false,
      message: result.error
    });
  }

  return res.status(200).json({
    success: true,
    message: 'User updated successfully',
    data: result.data
  });
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser
};
