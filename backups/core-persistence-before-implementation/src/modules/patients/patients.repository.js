const Patient = require('./entities/patient.entity');
const PatientProfile = require('./entities/patient-profile.entity');
const EmergencyContact = require('./entities/emergency-contact.entity');

const patients = [];

const findAll = () => patients;

const findById = (id) => {
  return patients.find((patient) => patient.id === Number(id));
};

const findByUserId = (userId) => {
  return patients.find(
    (patient) => patient.userId === Number(userId)
  );
};

const create = (data) => {
  const nextId = patients.length
    ? Math.max(...patients.map((patient) => patient.id)) + 1
    : 1;

  const patient = new Patient({
    id: nextId,
    userId: data.userId,
    profile: new PatientProfile(data.profile),
    emergencyContact: new EmergencyContact(data.emergencyContact),
    createdAt: new Date().toISOString()
  });

  patients.push(patient);
  return patient;
};

const update = (id, data) => {
  const patient = findById(id);

  if (!patient) return null;

  patient.profile = new PatientProfile(data.profile);
  patient.emergencyContact = new EmergencyContact(data.emergencyContact);

  return patient;
};

const remove = (id) => {
  const index = patients.findIndex(
    (patient) => patient.id === Number(id)
  );

  if (index === -1) return false;

  patients.splice(index, 1);
  return true;
};

module.exports = {
  findAll,
  findById,
  findByUserId,
  create,
  update,
  remove
};