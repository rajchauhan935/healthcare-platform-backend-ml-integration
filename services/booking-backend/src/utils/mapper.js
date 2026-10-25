
function toCamelCase(key) {
  return key.replace(/_([a-z])/g, (_, letter) =>
    letter.toUpperCase()
  );
}

function mapToCamelCase(value) {
  if (Array.isArray(value)) {
    return value.map(mapToCamelCase);
  }

  // Preserve Date objects and convert them to ISO strings.
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        toCamelCase(key),
        mapToCamelCase(item),
      ])
    );
  }

  return value;
}

module.exports = { toCamelCase, mapToCamelCase };
