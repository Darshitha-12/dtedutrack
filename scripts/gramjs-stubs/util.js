module.exports = {
  promisify: (fn) => fn,
  callbackify: (fn) => fn,
  inspect: (o) => String(o),
  TextDecoder: globalThis.TextDecoder,
  TextEncoder: globalThis.TextEncoder,
  types: {},
};