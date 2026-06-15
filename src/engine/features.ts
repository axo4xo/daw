import {requireProperty} from "@opendaw/lib-std"

// Fails fast on browsers missing the APIs the engine needs (OPFS, AudioWorklet,
// WebCrypto, Promise.withResolvers). Mirrors the openDAW headless template.
export const testFeatures = async (): Promise<void> => {
    requireProperty(Promise, "withResolvers")
    requireProperty(window, "indexedDB")
    requireProperty(window, "AudioWorkletNode")
    requireProperty(navigator, "storage")
    requireProperty(navigator.storage, "getDirectory")
    requireProperty(crypto, "randomUUID")
    requireProperty(crypto, "subtle")
    requireProperty(crypto.subtle, "digest")
}
