export interface PrecisionMode {
  readonly value: 0 | 1;
}
export namespace PrecisionMode {
  const STRICT: PrecisionMode;
  const RELAXED: PrecisionMode;
}

export interface MeasurementEnvironmentCondition {
  readonly value: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
}
export namespace MeasurementEnvironmentCondition {
  const FACE_POSITION: MeasurementEnvironmentCondition;
  const FOREHEAD_VISIBLE: MeasurementEnvironmentCondition;
  const GLASSES_NOT_DETECTED: MeasurementEnvironmentCondition;
  const SUFFICIENT_LIGHT_LEVEL: MeasurementEnvironmentCondition;
  const EVEN_LIGHTING: MeasurementEnvironmentCondition;
  const NO_BACKLIGHT: MeasurementEnvironmentCondition;
  const FACE_STABLE: MeasurementEnvironmentCondition;
  const DEVICE_STABLE: MeasurementEnvironmentCondition;
}

export interface Screen {
  readonly value: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 10 | 12 | 13;
}
export namespace Screen {
  const INITIALIZATION: Screen;
  const ONBOARDING: Screen;
  const MEASUREMENT: Screen;
  const INSTRUCTIONS: Screen;
  const RESULTS: Screen;
  const HEALTH_RISKS: Screen;
  const HEALTH_RISKS_EDIT: Screen;
  const CALIBRATION_ONBOARDING: Screen;
  const CALIBRATION_FINISH: Screen;
  const CALIBRATION_DATA_ENTRY: Screen;
  const DISCLAIMER: Screen;
  const DASHBOARD: Screen;
}

export interface OperatingMode {
  readonly value: 0 | 1 | 2;
}
export namespace OperatingMode {
  const POSITIONING: OperatingMode;
  const MEASURE: OperatingMode;
  const SYSTEM_OVERLOADED: OperatingMode;
}

export interface Metric {
  readonly value: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
}
export namespace Metric {
  const HEART_RATE: Metric;
  const HRV_SDNN: Metric;
  const BREATHING_RATE: Metric;
  const SYSTOLIC_BP: Metric;
  const DIASTOLIC_BP: Metric;
  const CARDIAC_STRESS: Metric;
  const PNS_ACTIVITY: Metric;
  const CARDIAC_WORKLOAD: Metric;
  const AGE: Metric;
  const BMI: Metric;
  const BLOOD_PRESSURE: Metric;
  const BLOOD_PRESSURE_SCALE: Metric;
}

export interface HealthIndex {
  readonly value: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
}
export namespace HealthIndex {
  const WELLNESS_SCORE: HealthIndex;
  const VASCULAR_AGE: HealthIndex;
  const CARDIOVASCULAR_DISEASE_RISK: HealthIndex;
  const HARD_AND_FATAL_EVENTS_RISKS: HealthIndex;
  const CARDIOVASCULAR_RISK_SCORE: HealthIndex;
  const WAIST_TO_HEIGHT_RATIO: HealthIndex;
  const BODY_FAT_PERCENTAGE: HealthIndex;
  const BODY_ROUNDNESS_INDEX: HealthIndex;
  const A_BODY_SHAPE_INDEX: HealthIndex;
  const CONICITY_INDEX: HealthIndex;
  const BASAL_METABOLIC_RATE: HealthIndex;
  const TOTAL_DAILY_ENERGY_EXPENDITURE: HealthIndex;
  const HYPERTENSION_RISK: HealthIndex;
  const DIABETES_RISK: HealthIndex;
  const NON_ALCOHOLIC_FATTY_LIVER_DISEASE_RISK: HealthIndex;
}

export interface MeasurementPreset {
  readonly value: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
}
export namespace MeasurementPreset {
  const ONE_MINUTE_HR_HRV_BR: MeasurementPreset;
  const ONE_MINUTE_BETA_METRICS: MeasurementPreset;
  const INFINITE_HR: MeasurementPreset;
  const INFINITE_METRICS: MeasurementPreset;
  const FOURTY_FIVE_SECONDS_UNVALIDATED: MeasurementPreset;
  const THIRTY_SECONDS_UNVALIDATED: MeasurementPreset;
  const CUSTOM: MeasurementPreset;
  const ONE_MINUTE_ALL_METRICS: MeasurementPreset;
  const FOURTY_FIVE_SECONDS_ALL_METRICS: MeasurementPreset;
  const THIRTY_SECONDS_ALL_METRICS: MeasurementPreset;
  const QUICK_HR_MODE: MeasurementPreset;
}

export interface InitializationMode {
  readonly value: 0 | 1 | 2 | 3;
}
export namespace InitializationMode {
  const MEASUREMENT: InitializationMode;
  const CALIBRATION: InitializationMode;
  const CALIBRATED_MEASUREMENT: InitializationMode;
  const FAST_CALIBRATION: InitializationMode;
}

export interface CalibrationState {
  readonly value: 0 | 1 | 2;
}
export namespace CalibrationState {
  const CALIBRATED: CalibrationState;
  const NOT_CALIBRATED: CalibrationState;
  const OUTDATED: CalibrationState;
}

export interface CameraMode {
  readonly value: 0 | 1 | 2 | 3 | 4;
}
export namespace CameraMode {
  const OFF: CameraMode;
  const FACING_USER: CameraMode;
  const FACING_ENVIRONMENT: CameraMode;
  const DEVICE_ID: CameraMode;
  const MEDIA_STREAM: CameraMode;
}

export interface OnboardingMode {
  readonly value: 0 | 1 | 2;
}
export namespace OnboardingMode {
  const HIDDEN: OnboardingMode;
  const SHOW_ONCE: OnboardingMode;
  const SHOW_ALWAYS: OnboardingMode;
}

export interface UiVersion {
  readonly value: 0 | 1;
}
export namespace UiVersion {
  const V1: UiVersion;
  const V2: UiVersion;
}

export interface InitializationResult {
  readonly value: 0 | 1 | 2 | 3;
}
export namespace InitializationResult {
  const OK: InitializationResult;
  const INVALID_API_KEY: InitializationResult;
  const CONNECTION_ERROR: InitializationResult;
  const INTERNAL_ERROR: InitializationResult;
}

export interface FaceState {
  readonly value: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}
export namespace FaceState {
  const OK: FaceState;
  const TOO_FAR: FaceState;
  const TOO_CLOSE: FaceState;
  const NOT_CENTERED: FaceState;
  const NOT_VISIBLE: FaceState;
  const TURNED_AWAY: FaceState;
  const UNKNOWN: FaceState;
}

export interface MeasurementState {
  readonly value: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
}
export namespace MeasurementState {
  const NOT_STARTED: MeasurementState;
  const WAITING_FOR_FACE: MeasurementState;
  const RUNNING_SIGNAL_SHORT: MeasurementState;
  const RUNNING_SIGNAL_GOOD: MeasurementState;
  const RUNNING_SIGNAL_BAD: MeasurementState;
  const RUNNING_SIGNAL_BAD_DEVICE_UNSTABLE: MeasurementState;
  const FINISHED: MeasurementState;
  const FAILED: MeasurementState;
}

export interface NAFLDRisk {
  readonly value: 0 | 1 | 2;
}
export namespace NAFLDRisk {
  const LOW: NAFLDRisk;
  const MODERATE: NAFLDRisk;
  const HIGH: NAFLDRisk;
}

export interface BmiCategory {
  readonly value: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
}
export namespace BmiCategory {
  const UNDERWEIGHT_SEVERE: BmiCategory;
  const UNDERWEIGHT_MODERATE: BmiCategory;
  const UNDERWEIGHT_MILD: BmiCategory;
  const NORMAL: BmiCategory;
  const OVERWEIGHT: BmiCategory;
  const OBESE_CLASS_I: BmiCategory;
  const OBESE_CLASS_II: BmiCategory;
  const OBESE_CLASS_III: BmiCategory;
}

export interface HypertensionTreatment {
  readonly value: 0 | 1 | 2;
}
export namespace HypertensionTreatment {
  const NOT_NEEDED: HypertensionTreatment;
  const NO: HypertensionTreatment;
  const YES: HypertensionTreatment;
}

export interface Gender {
  readonly value: 0 | 1 | 2;
}
export namespace Gender {
  const MALE: Gender;
  const FEMALE: Gender;
  const OTHER: Gender;
}

export interface Race {
  readonly value: 0 | 1 | 2;
}
export namespace Race {
  const WHITE: Race;
  const AFRICAN_AMERICAN: Race;
  const OTHER: Race;
}

export interface PhysicalActivity {
  readonly value: 0 | 1 | 2 | 3 | 4;
}
export namespace PhysicalActivity {
  const SEDENTARY: PhysicalActivity;
  const LIGHTLY_ACTIVE: PhysicalActivity;
  const MODERATELY: PhysicalActivity;
  const VERY_ACTIVE: PhysicalActivity;
  const EXTRA_ACTIVE: PhysicalActivity;
}

export interface ParentalHistory {
  readonly value: 0 | 1 | 2;
}
export namespace ParentalHistory {
  const NONE: ParentalHistory;
  const ONE: ParentalHistory;
  const BOTH: ParentalHistory;
}

export interface FamilyHistory {
  readonly value: 0 | 1 | 2;
}
export namespace FamilyHistory {
  const NONE: FamilyHistory;
  const NONE_FIRST_DEGREE: FamilyHistory;
  const FIRST_DEGREE: FamilyHistory;
}

export interface ShenaiSDKEnums {
  readonly PrecisionMode: typeof PrecisionMode;
  readonly MeasurementEnvironmentCondition: typeof MeasurementEnvironmentCondition;
  readonly Screen: typeof Screen;
  readonly OperatingMode: typeof OperatingMode;
  readonly Metric: typeof Metric;
  readonly HealthIndex: typeof HealthIndex;
  readonly MeasurementPreset: typeof MeasurementPreset;
  readonly InitializationMode: typeof InitializationMode;
  readonly CalibrationState: typeof CalibrationState;
  readonly CameraMode: typeof CameraMode;
  readonly OnboardingMode: typeof OnboardingMode;
  readonly UiVersion: typeof UiVersion;
  readonly InitializationResult: typeof InitializationResult;
  readonly FaceState: typeof FaceState;
  readonly MeasurementState: typeof MeasurementState;
  readonly NAFLDRisk: typeof NAFLDRisk;
  readonly BmiCategory: typeof BmiCategory;
  readonly HypertensionTreatment: typeof HypertensionTreatment;
  readonly Gender: typeof Gender;
  readonly Race: typeof Race;
  readonly PhysicalActivity: typeof PhysicalActivity;
  readonly ParentalHistory: typeof ParentalHistory;
  readonly FamilyHistory: typeof FamilyHistory;
}
