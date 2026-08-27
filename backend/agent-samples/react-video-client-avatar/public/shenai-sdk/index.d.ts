export * from "./util/src/index";
export * from "./enums/index";

import {
  PrecisionMode,
  MeasurementEnvironmentCondition,
  Screen,
  OperatingMode,
  Metric,
  HealthIndex,
  MeasurementPreset,
  InitializationMode,
  CalibrationState,
  CameraMode,
  OnboardingMode,
  UiVersion,
  InitializationResult,
  FaceState,
  MeasurementState,
  NAFLDRisk,
  BmiCategory,
  HypertensionTreatment,
  Gender,
  Race,
  PhysicalActivity,
  ParentalHistory,
  FamilyHistory,
  ShenaiSDKEnums,
} from "./enums/index";

export interface ShenaiArguments {
  // Emscripten module settings
  onRuntimeInitialized?: () => void;
  locateFile?: (filename: string) => string;
  print?: (text: string) => void;

  // Shen.AI SDK loading settings
  enableErrorReporting?: boolean; // whether to enable error reporting
  enablePreloadDisplay?: boolean; // whether to show the preload display
  preloadDisplayCanvasId?: string; // ID of the canvas element for preload display
  hidePreloadDisplayLogo?: boolean; // whether to hide the Shen logo on the preload display (default: true)
  wasmLoadingProgressCallback?: (progress: number) => void; // callback for loading progress
}

export interface Heartbeat {
  start_location_sec: number;
  end_location_sec: number;
  duration_ms: number;
}

export interface MeasurementResults {
  heart_rate_bpm: number;
  hrv_sdnn_ms: number | null;
  hrv_lnrmssd_ms: number | null;
  stress_index: number | null;
  parasympathetic_activity: number | null;
  breathing_rate_bpm: number | null;
  systolic_blood_pressure_mmhg: number | null;
  diastolic_blood_pressure_mmhg: number | null;
  cardiac_workload_mmhg_per_sec: number | null;
  age_years: number | null;
  bmi_kg_per_m2: number | null;
  bmi_category: BmiCategory | null;
  weight_kg: number | null;
  height_cm: number | null;
  heartbeats: Heartbeat[];
  average_signal_quality: number;
}

export interface MeasurementResultsWithMetadata {
  measurement_results: MeasurementResults;
  epoch_timestamp: number;
  is_calibration: boolean;
}

export interface MeasurementResultsHistory {
  history: MeasurementResultsWithMetadata[];
}

export interface CustomMeasurementConfig {
  durationSeconds?: number;
  infiniteMeasurement?: boolean;

  instantMetrics?: Metric[];
  summaryMetrics?: Metric[];
  healthIndices?: HealthIndex[];

  realtimeHrPeriodSeconds?: number;
  realtimeHrvPeriodSeconds?: number;
  realtimeCardiacStressPeriodSeconds?: number;
}

export interface CustomColorTheme {
  themeColor: string;
  textColor: string;
  backgroundColor: string;
  tileColor: string;
  buttonMainColor?: string;
  buttonSecondaryColor?: string;
}

export interface NormalizedFaceBbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Vector3d {
  x: number;
  y: number;
  z: number;
}

export interface EulerAngles {
  yaw: number;
  pitch: number;
  roll: number;
}

export interface FacePose {
  position: Vector3d;
  rotation: EulerAngles;
}

export interface MomentaryHrValue {
  timestamp_sec: number;
  hr_bpm: number;
}

interface HardAndFatalEventsRisks {
  coronaryDeathEventRisk: number | null;
  fatalStrokeEventRisk: number | null;
  totalCVMortalityRisk: number | null;
  hardCVEventRisk: number | null;
}

interface CVDiseasesRisks {
  overallRisk: number | null;
  coronaryHeartDiseaseRisk: number | null;
  strokeRisk: number | null;
  heartFailureRisk: number | null;
  peripheralVascularDiseaseRisk: number | null;
}

interface RisksFactorsScores {
  ageScore: number | null;
  sbpScore: number | null;
  smokingScore: number | null;
  diabetesScore: number | null;
  bmiScore: number | null;
  cholesterolScore: number | null;
  cholesterolHdlScore: number | null;
  totalScore: number | null;
}

export interface HealthRisks {
  wellnessScore: number | null;
  hardAndFatalEvents: HardAndFatalEventsRisks;
  cvDiseases: CVDiseasesRisks;
  vascularAge: number | null;
  waistToHeightRatio: number | null;
  bodyFatPercentage: number | null;
  basalMetabolicRate: number | null;
  bodyRoundnessIndex: number | null;
  conicityIndex: number | null;
  aBodyShapeIndex: number | null;
  totalDailyEnergyExpenditure: number | null;
  scores: RisksFactorsScores;
  hypertensionRisk?: number | null;
  diabetesRisk?: number | null;
  nonAlcoholicFattyLiverDiseaseRisk?: NAFLDRisk | null;
}

export interface RisksFactors {
  age?: number;
  cholesterol?: number;
  cholesterolHdl?: number;
  sbp?: number;
  dbp?: number;
  isSmoker?: boolean;
  hypertensionTreatment?: HypertensionTreatment;
  hasDiabetes?: boolean;
  bodyHeight?: number; // in centimeters
  bodyWeight?: number; // in kilograms
  waistCircumference?: number; // in centimeters
  neckCircumference?: number; // in centimeters
  hipCircumference?: number; // in centimeters
  gender?: Gender;
  physicalActivity?: PhysicalActivity;
  country?: string; // country name ISO code: https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2
  race?: Race;
  vegetableFruitDiet?: boolean;
  historyOfHypertension?: boolean;
  historyOfHighGlucose?: boolean;
  fastingGlucose?: number;
  triglyceride?: number;
  parentalHypertension?: ParentalHistory;
  familyDiabetes?: FamilyHistory;
}

export type EventName =
  | "START_BUTTON_CLICKED"
  | "STOP_BUTTON_CLICKED"
  | "MEASUREMENT_FINISHED"
  | "USER_FLOW_FINISHED"
  | "SCREEN_CHANGED";

export interface InitializationSettings {
  initializationMode?: InitializationMode;
  precisionMode?: PrecisionMode;
  operatingMode?: OperatingMode;
  measurementPreset?: MeasurementPreset;
  cameraMode?: CameraMode;
  cameraAspectRatio?: number;
  onboardingMode?: OnboardingMode;
  showUserInterface?: boolean;
  showFacePositioningOverlay?: boolean;
  showVisualWarnings?: boolean;
  enableCameraSwap?: boolean;
  showFaceMask?: boolean;
  showBloodFlow?: boolean;
  hideShenaiLogo?: boolean;
  enableStartAfterSuccess?: boolean;
  enableSummaryScreen?: boolean;
  showResultsFinishButton?: boolean;
  enableHealthRisks?: boolean;
  showHealthIndicesFinishButton?: boolean;
  saveHealthRisksFactors?: boolean;
  showOutOfRangeResultIndicators?: boolean;
  showSignalQualityIndicator?: boolean;
  showSignalTile?: boolean;
  showStartStopButton?: boolean;
  showInfoButton?: boolean;
  showDisclaimer?: boolean;
  enableMeasurementsDashboard?: boolean;
  uiVersion?: UiVersion;
  showTrialMetricLabels?: boolean;
  applyPrecisionModeToBloodPressure?: boolean;
  blockingMeasurementConditions?: MeasurementEnvironmentCondition[];
  warningMeasurementConditions?: MeasurementEnvironmentCondition[];
  enableFullFrameProcessing?: boolean;
  language?: string;
  customColorTheme?: CustomColorTheme;
  customMeasurementConfig?: CustomMeasurementConfig;
  risksFactors?: RisksFactors;
  uiFlowScreens?: Screen[];
  eventCallback?: (event: EventName) => void;
  onCameraError?: () => void;
}

export interface UIConfig {
  onboardingMode: OnboardingMode;
  uiVersion?: UiVersion;

  showUserInterface: boolean;
  showFacePositioningOverlay: boolean;
  showWarningIcons: boolean;
  enableCameraSwap: boolean;
  showFaceMask: boolean;
  showBloodFlow: boolean;
  hideShenaiLogo: boolean;
  enableStartAfterSuccess: boolean;
  enableSummaryScreen: boolean;
  showResultsFinishButton: boolean;
  enableHealthRisks: boolean;
  showHealthIndicesFinishButton: boolean;
  saveHealthRisksFactors: boolean;
  showOutOfRangeResultIndicators: boolean;
  showTrialMetricLabels: boolean;

  colorTheme: CustomColorTheme;
}

export interface SDKConfig {
  cameraMode: CameraMode;
  initialOperatingMode: OperatingMode;
  precisionMode: PrecisionMode;

  language: string;

  measurementPreset: MeasurementPreset;
  measurementConfig: CustomMeasurementConfig;

  uiConfig: UIConfig;

  enableFullFrameProcessing: boolean;
}

export interface ShenaiSDK extends ShenaiSDKEnums {
  getVersion: () => string;

  initialize: (
    apiKey: string,
    userId: string,
    initializationSettings: InitializationSettings,
    onResult: (result: InitializationResult) => void
  ) => void;
  isInitialized: () => boolean;
  deinitialize: () => void;
  destroyRuntime: () => void;

  attachToCanvas: (canvas: string, exclusive?: boolean) => void;

  // Calibration state
  getUserCalibrationState: (userId: string) => CalibrationState;
  getCalibrationState: () => CalibrationState;
  getSbpCalibrationOffset: () => number;
  getDbpCalibrationOffset: () => number;

  // SDK operating mode
  setOperatingMode: (mode: OperatingMode) => void;
  getOperatingMode: () => OperatingMode;
  startMeasurement: () => void;
  stopMeasurement: () => void;
  resetMeasurementSession: () => void;

  // SDK precision mode
  setPrecisionMode: (mode: PrecisionMode) => void;
  getPrecisionMode: () => PrecisionMode;

  // SDK measurement preset
  setMeasurementPreset: (preset: MeasurementPreset) => void;
  getMeasurementPreset: () => MeasurementPreset;
  setCustomMeasurementConfig: (config: CustomMeasurementConfig) => void;
  getCustomMeasurementConfig: () => CustomMeasurementConfig;

  // SDK camera mode
  setCameraMode: (mode: CameraMode) => void;
  getCameraMode: () => CameraMode;
  selectCameraByDeviceId: (deviceId: string, facingUser?: boolean) => void;
  setEnableFullFrameProcessing: (enable: boolean) => void;
  getEnableFullFrameProcessing: () => boolean;
  setMediaStream: (stream: MediaStream, facingUser?: boolean) => void;

  // SDK interface elements
  setShowUserInterface: (show: boolean) => void;
  getShowUserInterface: () => boolean;
  setShowFacePositioningOverlay: (show: boolean) => void;
  getShowFacePositioningOverlay: () => boolean;
  setShowVisualWarnings: (show: boolean) => void;
  getShowVisualWarnings: () => boolean;
  setEnableCameraSwap: (enable: boolean) => void;
  getEnableCameraSwap: () => boolean;
  setShowFaceMask: (show: boolean) => void;
  getShowFaceMask: () => boolean;
  setShowBloodFlow: (show: boolean) => void;
  getShowBloodFlow: () => boolean;
  setEnableStartAfterSuccess: (enable: boolean) => void;
  getEnableStartAfterSuccess: () => boolean;
  setHideShenaiLogo: (hide: boolean) => void;
  getHideShenaiLogo: () => boolean;
  setShowOutOfRangeResultIndicators: (show: boolean) => void;
  getShowOutOfRangeResultIndicators: () => boolean;
  setShowTrialMetricLabels: (show: boolean) => void;
  getShowTrialMetricLabels: () => boolean;
  setApplyPrecisionModeToBloodPressure: (apply: boolean) => void;
  getApplyPrecisionModeToBloodPressure: () => boolean;
  setBlockingMeasurementConditions: (
    conditions: MeasurementEnvironmentCondition[]
  ) => void;
  getBlockingMeasurementConditions: () => MeasurementEnvironmentCondition[];
  setWarningMeasurementConditions: (
    conditions: MeasurementEnvironmentCondition[]
  ) => void;
  getWarningMeasurementConditions: () => MeasurementEnvironmentCondition[];
  getCurrentViolatedMeasurementEnvironmentCondition: () =>
    | MeasurementEnvironmentCondition
    | null;
  setEnableSummaryScreen: (enable: boolean) => void;
  getEnableSummaryScreen: () => boolean;
  setShowResultsFinishButton: (show: boolean) => void;
  getShowResultsFinishButton: () => boolean;
  setEnableHealthRisks: (enable: boolean) => void;
  getEnableHealthRisks: () => boolean;
  setShowHealthIndicesFinishButton: (show: boolean) => void;
  getShowHealthIndicesFinishButton: () => boolean;
  setShowSignalTile: (show: boolean) => void;
  getShowSignalTile: () => boolean;
  setShowSignalQualityIndicator: (show: boolean) => void;
  getShowSignalQualityIndicator: () => boolean;
  setShowStartStopButton: (show: boolean) => void;
  getShowStartStopButton: () => boolean;
  setEnableMeasurementsDashboard: (enable: boolean) => void;
  getEnableMeasurementsDashboard: () => boolean;
  setUiVersion: (version: UiVersion) => void;
  getUiVersion: () => UiVersion;
  setUiFlowScreens: (screens: Screen[]) => void;
  getUiFlowScreens: () => Screen[];
  setShowInfoButton: (show: boolean) => void;
  getShowInfoButton: () => boolean;
  getShowDisclaimer: () => boolean;

  setOnboardingMode: (mode: OnboardingMode) => void;
  getOnboardingMode: () => OnboardingMode;

  // SDK color theme
  setCustomColorTheme: (theme: CustomColorTheme) => void;
  getCustomColorTheme: () => CustomColorTheme;

  // SDK face positioning
  getFaceState: () => FaceState;
  getNormalizedFaceBbox: () => NormalizedFaceBbox | null;
  getFacePose: () => FacePose | null;

  // SDK measurement state
  getMeasurementState: () => MeasurementState;
  isReadyToStartMeasurement: () => boolean;
  getMeasurementProgressPercentage: () => number;

  // SDK measurement results
  getHeartRate10s: () => number | null;
  getHeartRate4s: () => number | null;
  getRealtimeHeartRate: () => number | null;
  getRealtimeHrvSdnn: () => number | null;
  getRealtimeCardiacStress: () => number | null;
  getRealtimeMetrics: (periodSec: number) => MeasurementResults | null;
  getMeasurementResults: () => MeasurementResults | null;
  getMeasurementResultsHistory: () => MeasurementResultsHistory | null;

  // SDK health risks
  getHealthRisksFactors: () => RisksFactors;
  clearHealthRisksFactors: () => void;
  getHealthRisks: () => HealthRisks;
  computeHealthRisks: (factors: RisksFactors) => HealthRisks;
  getMaximalRisks: (factors: RisksFactors) => HealthRisks;
  getMinimalRisks: (factors: RisksFactors) => HealthRisks;
  getReferenceRisks: (factors: RisksFactors) => HealthRisks;

  // SDK signals
  getHeartRateHistory10s: (maxTimeSec?: number) => MomentaryHrValue[];
  getHeartRateHistory4s: (maxTimeSec?: number) => MomentaryHrValue[];
  getRealtimeHeartbeats: (periodSec?: number) => Heartbeat[];
  getFullPpgSignal: () => number[];

  // SDK recording
  setRecordingEnabled: (enabled: boolean) => void;
  getRecordingEnabled: () => boolean;

  // SDK quality control
  getTotalBadSignalSeconds: () => number;
  getCurrentSignalQualityMetric: () => number;

  // SDK visualizations
  getSignalQualityMapPng: () => number[];
  getFaceTexturePng: () => number[];
  getMetaPredictionImagePng: () => number[];

  // Screen management
  setScreen(screen: Screen): void;
  getScreen(): Screen;

  // Languages
  setLanguage: (language: string) => void;
  getLanguage: () => string;

  // Licensing
  getPricingPlan: () => string;

  // Tracing
  getTraceID: () => string;
  getMeasurementID: () => string;

  // SDK configuration
  getSDKConfigString: () => string;
  applySDKConfig(configJson: string): void;

  // Email sending
  sendMeasurementResultsPdfToEmail: (
    email: string,
    callback: (success: boolean) => void
  ) => void;
  openMeasurementResultsPdfInBrowser: () => void;
  getMeasurementResultsPdfUrl: (callback: (url: string) => void) => void;
  getMeasurementResultsPdfBytes: (
    callback: (bytes: Uint8Array) => void
  ) => void;
  getResultAsFhirObservation: () => string | null;
  sendResultFhirObservation: (
    url: string,
    callback?: (response: string) => void
  ) => void;
}

export function createPreloadDisplay(
  canvasId: string,
  options?: { hideLogo?: boolean }
): void;

export default function (args: ShenaiArguments): Promise<ShenaiSDK>;
