const validateUpdateUser = (data) => {
  const errors = [];

  if (typeof data.name !== 'string' || !data.name.trim()) {
    errors.push('Valid name is required');
  }

  if (
    typeof data.email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
  ) {
    errors.push('Valid email is required');
  }

  // Role changes are intentionally not allowed through this update API.
  if (data.role !== undefined) {
    errors.push('Role cannot be changed through this endpoint');
  }

  return errors;
};

module.exports = { validateUpdateUser };
