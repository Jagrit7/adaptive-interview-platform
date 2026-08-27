export let _sdk = null;

export function _initEnums(sdk) {
  _sdk = sdk;
}

export function _getEnum(enumName, prop) {
  if (!_sdk) {
    throw new Error(`Enums are not initialized. Load the Shen.AI SDK first.`);
  }
  return _sdk[enumName][prop];
}
