const createHospitalEntity = ({
  id,
  name,
  address,
  latitude,
  longitude,
  paymentTiers = ['SELF_PAY'],
  isActive = true
}) => ({
  id,
  name,
  address,
  latitude,
  longitude,
  paymentTiers,
  isActive,
  createdAt: new Date().toISOString()
});

module.exports = {
  createHospitalEntity
};