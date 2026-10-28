// REFACTOR:grounded: public facade preserves old calls and exposes bounded reusable pools.
export {NativeRuntimeError} from './nativeProcess';
export type {NativeMode,NativeSpec,NativeRuntime} from './nativeWorkerOwner';
export {withNativeRuntime,withDefaultNativeJob,shutdownNativeRuntime,createNativeWorkerPool,setNativeWorkerLimit,nativeWorkerPoolStatus,withNativeOperation,assertOutsideNativeJob,checkNativeAdmission,drainRetiredNativeWorkers} from './nativeWorkerPool';
export type {NativeWorkerPool,NativeWorkerPoolStatus} from './nativeWorkerPool';
