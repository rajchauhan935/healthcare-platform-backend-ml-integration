const currentUser = (req) => {
  return req.user || null;
};

module.exports = currentUser;