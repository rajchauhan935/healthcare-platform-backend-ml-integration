const repository = require('./users.repository');

const getAllUsers = () => repository.findAll();

const getUserById = (id) => repository.findById(id);

const createUser = (data) => {
  const existingUser = repository.findByEmail(data.email);

  if (existingUser) {
    return {
      error: 'A user with this email already exists'
    };
  }

  return {
    data: repository.create({
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      role: data.role
    })
  };
};

const updateUser = (id, data) => {
  const user = repository.findById(id);

  if (!user) {
    return { error: 'User not found', status: 404 };
  }

  const existingUser = repository.findByEmail(data.email);

  if (existingUser && existingUser.id !== user.id) {
    return {
      error: 'A user with this email already exists',
      status: 409
    };
  }

  return {
    data: repository.update(id, {
      name: data.name.trim(),
      email: data.email.trim().toLowerCase()
    })
  };
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser
};
