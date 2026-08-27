import { _sdk, _getEnum } from "./init.js"

export const PrecisionMode = new Proxy({}, {
  get(_, prop) { return _getEnum("PrecisionMode", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.PrecisionMode) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.PrecisionMode) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.PrecisionMode) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("PrecisionMode", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const MeasurementEnvironmentCondition = new Proxy({}, {
  get(_, prop) { return _getEnum("MeasurementEnvironmentCondition", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.MeasurementEnvironmentCondition) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.MeasurementEnvironmentCondition) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.MeasurementEnvironmentCondition) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("MeasurementEnvironmentCondition", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const Screen = new Proxy({}, {
  get(_, prop) { return _getEnum("Screen", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.Screen) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.Screen) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.Screen) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("Screen", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const OperatingMode = new Proxy({}, {
  get(_, prop) { return _getEnum("OperatingMode", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.OperatingMode) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.OperatingMode) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.OperatingMode) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("OperatingMode", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const Metric = new Proxy({}, {
  get(_, prop) { return _getEnum("Metric", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.Metric) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.Metric) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.Metric) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("Metric", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const HealthIndex = new Proxy({}, {
  get(_, prop) { return _getEnum("HealthIndex", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.HealthIndex) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.HealthIndex) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.HealthIndex) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("HealthIndex", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const MeasurementPreset = new Proxy({}, {
  get(_, prop) { return _getEnum("MeasurementPreset", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.MeasurementPreset) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.MeasurementPreset) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.MeasurementPreset) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("MeasurementPreset", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const InitializationMode = new Proxy({}, {
  get(_, prop) { return _getEnum("InitializationMode", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.InitializationMode) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.InitializationMode) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.InitializationMode) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("InitializationMode", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const CalibrationState = new Proxy({}, {
  get(_, prop) { return _getEnum("CalibrationState", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.CalibrationState) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.CalibrationState) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.CalibrationState) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("CalibrationState", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const CameraMode = new Proxy({}, {
  get(_, prop) { return _getEnum("CameraMode", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.CameraMode) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.CameraMode) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.CameraMode) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("CameraMode", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const OnboardingMode = new Proxy({}, {
  get(_, prop) { return _getEnum("OnboardingMode", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.OnboardingMode) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.OnboardingMode) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.OnboardingMode) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("OnboardingMode", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const UiVersion = new Proxy({}, {
  get(_, prop) { return _getEnum("UiVersion", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.UiVersion) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.UiVersion) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.UiVersion) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("UiVersion", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const InitializationResult = new Proxy({}, {
  get(_, prop) { return _getEnum("InitializationResult", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.InitializationResult) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.InitializationResult) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.InitializationResult) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("InitializationResult", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const FaceState = new Proxy({}, {
  get(_, prop) { return _getEnum("FaceState", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.FaceState) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.FaceState) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.FaceState) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("FaceState", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const MeasurementState = new Proxy({}, {
  get(_, prop) { return _getEnum("MeasurementState", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.MeasurementState) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.MeasurementState) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.MeasurementState) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("MeasurementState", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const NAFLDRisk = new Proxy({}, {
  get(_, prop) { return _getEnum("NAFLDRisk", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.NAFLDRisk) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.NAFLDRisk) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.NAFLDRisk) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("NAFLDRisk", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const BmiCategory = new Proxy({}, {
  get(_, prop) { return _getEnum("BmiCategory", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.BmiCategory) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.BmiCategory) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.BmiCategory) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("BmiCategory", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const HypertensionTreatment = new Proxy({}, {
  get(_, prop) { return _getEnum("HypertensionTreatment", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.HypertensionTreatment) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.HypertensionTreatment) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.HypertensionTreatment) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("HypertensionTreatment", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const Gender = new Proxy({}, {
  get(_, prop) { return _getEnum("Gender", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.Gender) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.Gender) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.Gender) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("Gender", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const Race = new Proxy({}, {
  get(_, prop) { return _getEnum("Race", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.Race) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.Race) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.Race) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("Race", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const PhysicalActivity = new Proxy({}, {
  get(_, prop) { return _getEnum("PhysicalActivity", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.PhysicalActivity) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.PhysicalActivity) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.PhysicalActivity) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("PhysicalActivity", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const ParentalHistory = new Proxy({}, {
  get(_, prop) { return _getEnum("ParentalHistory", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.ParentalHistory) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.ParentalHistory) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.ParentalHistory) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("ParentalHistory", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

export const FamilyHistory = new Proxy({}, {
  get(_, prop) { return _getEnum("FamilyHistory", prop); },
  has(_, prop) { return prop in ((_sdk && _sdk.FamilyHistory) || {}); },
  ownKeys() { return Object.keys((_sdk && _sdk.FamilyHistory) || {}); },
  getOwnPropertyDescriptor(target, prop) {
    if (!(prop in target) && (prop in ((_sdk && _sdk.FamilyHistory) || {}))) {
      Object.defineProperty(target, prop, { value: _getEnum("FamilyHistory", prop), writable: false, enumerable: true, configurable: false });
    }
    return Reflect.getOwnPropertyDescriptor(target, prop);
  }
});

