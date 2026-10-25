const allowedRoles = [
  'PATIENT',
  'CREW',
  'HOSPITAL_STAFF',
  'DISPATCHER',
  'SUPPORT',
  'FINANCE',
  'ADMIN',
  'CEO',
  'CTO'
];

const validateCreateUser = (data) => {
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

  if (!allowedRoles.includes(data.role)) {
    errors.push('Valid role is required');
  }

  return errors;
};

module.exports = { validateCreateUser };
