const validateCreatePatient = (data) => {
  const errors = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return ['A valid request body is required'];
  }

  if (!Number.isInteger(data.userId) || data.userId <= 0) {
    errors.push('A valid userId is required');
  }

  if (!data.profile || typeof data.profile !== 'object') {
    errors.push('Patient profile is required');
  } else {
    if (
      typeof data.profile.fullName !== 'string' ||
      !data.profile.fullName.trim()
    ) {
      errors.push('Valid fullName is required');
    }

    if (
      !Number.isInteger(data.profile.age) ||
      data.profile.age < 0 ||
      data.profile.age > 120
    ) {
      errors.push('Valid age is required');
    }

    if (
      typeof data.profile.bloodGroup !== 'string' ||
      !data.profile.bloodGroup.trim()
    ) {
      errors.push('Valid bloodGroup is required');
    }
  }

  if (
    !data.emergencyContact ||
    typeof data.emergencyContact !== 'object'
  ) {
    errors.push('Emergency contact is required');
  } else {
    const contact = data.emergencyContact;

    if (typeof contact.name !== 'string' || !contact.name.trim()) {
      errors.push('Emergency contact name is required');
    }

    if (
      typeof contact.relationship !== 'string' ||
      !contact.relationship.trim()
    ) {
      errors.push('Emergency contact relationship is required');
    }

    if (
      typeof contact.phone !== 'string' ||
      !/^\+?[0-9]{10,15}$/.test(contact.phone)
    ) {
      errors.push('Valid emergency contact phone is required');
    }
  }

  return errors;
};

module.exports = { validateCreatePatient };