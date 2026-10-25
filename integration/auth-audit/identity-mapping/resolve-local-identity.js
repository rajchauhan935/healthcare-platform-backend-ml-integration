"use strict";

const SERVICES = Object.freeze([
  "booking",
  "homecare"
]);

function validIdentifier(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function resolveLocalIdentity(verifiedIdentity, mapping, service) {
  if (!SERVICES.includes(service)) {
    throw new Error("Unsupported service");
  }

  if (
    !verifiedIdentity ||
    !validIdentifier(verifiedIdentity.centralSubject)
  ) {
    throw new Error("Verified central identity required");
  }

  if (!mapping || typeof mapping !== "object") {
    throw new Error("Explicit account mapping required");
  }

  if (mapping.service !== service) {
    throw new Error("Mapping belongs to another service");
  }

  if (mapping.centralSubject !== verifiedIdentity.centralSubject) {
    throw new Error("Central subject mismatch");
  }

  if (mapping.active !== true) {
    throw new Error("Inactive account mapping");
  }

  if (!validIdentifier(mapping.localAccountId)) {
    throw new Error("Valid local account ID required");
  }

  if (!validIdentifier(mapping.localRole)) {
    throw new Error("Explicit local role required");
  }

  return Object.freeze({
    centralSubject: verifiedIdentity.centralSubject,
    service,
    localAccountId: mapping.localAccountId,
    localRole: mapping.localRole
  });
}

module.exports = {
  resolveLocalIdentity
};
