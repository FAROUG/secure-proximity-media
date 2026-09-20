"use client";

import Hls from "hls.js";
import {
  useEffect,
  useRef,
  useState,
} from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  "https://localhost:4000";

const SHARE_ID =
  "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

interface LocationState {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

interface AccessResult {
  allowed: boolean;
  reason: string;
  distanceMeters?: number;
}

type VerificationStep =
  | "email"
  | "code"
  | "verified";

export default function Home() {
  /*
   * --------------------------------------------------
   * EMAIL VERIFICATION
   * --------------------------------------------------
   */

  const [
    verificationStep,
    setVerificationStep,
  ] =
    useState<VerificationStep>(
      "email"
    );

  const [email, setEmail] =
    useState("");

  const [code, setCode] =
    useState("");

  const [
    sessionId,
    setSessionId,
  ] =
    useState<string | null>(
      null
    );

  const [
    verificationLoading,
    setVerificationLoading,
  ] =
    useState(false);

  /*
   * --------------------------------------------------
   * LOCATION / ACCESS STATE
   * --------------------------------------------------
   */

  const [
    location,
    setLocation,
  ] =
    useState<LocationState | null>(
      null
    );

  const [
    result,
    setResult,
  ] =
    useState<AccessResult | null>(
      null
    );

  const [
    mediaLoading,
    setMediaLoading,
  ] =
    useState(false);

  const [
    hlsManifestUrl,
    setHlsManifestUrl,
  ] =
    useState<string | null>(
      null
    );

  const [
    isSecureContext,
    setIsSecureContext,
  ] =
    useState<boolean | null>(
      null
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    tracking,
    setTracking,
  ] =
    useState(false);

  /*
   * --------------------------------------------------
   * REFS
   * --------------------------------------------------
   */

  const watchId =
    useRef<number | null>(
      null
    );

  const heartbeatId =
    useRef<ReturnType<
      typeof setInterval
    > | null>(
      null
    );

  const videoRef =
    useRef<HTMLVideoElement | null>(
      null
    );

  const hlsRef =
    useRef<Hls | null>(
      null
    );

  const manifestBlobUrlRef =
    useRef<string | null>(
      null
    );

  /*
   * --------------------------------------------------
   * CLIENT-ONLY VALUES
   * --------------------------------------------------
   */

  useEffect(() => {
    setIsSecureContext(
      window.isSecureContext
    );
  }, []);

  /*
   * --------------------------------------------------
   * REQUEST VERIFICATION CODE
   * --------------------------------------------------
   */

  async function requestVerificationCode() {
    setVerificationLoading(
      true
    );

    setError(
      null
    );

    try {
      const response =
        await fetch(
          `${API_URL}/share/${SHARE_ID}/verify/request`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                email:
                  email
                    .trim()
                    .toLowerCase(),
              }),
          }
        );

      const data =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          data.error ??
            "Failed to request verification code"
        );
      }

      setVerificationStep(
        "code"
      );
    } catch (
      err
    ) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to request verification code"
      );
    } finally {
      setVerificationLoading(
        false
      );
    }
  }

  /*
   * --------------------------------------------------
   * CONFIRM VERIFICATION CODE
   * --------------------------------------------------
   */

  async function confirmVerificationCode() {
    setVerificationLoading(
      true
    );

    setError(
      null
    );

    try {
      const response =
        await fetch(
          `${API_URL}/share/${SHARE_ID}/verify/confirm`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                email:
                  email
                    .trim()
                    .toLowerCase(),

                code:
                  code.trim(),
              }),
          }
        );

      const data =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          data.error ??
            data.reason ??
            "Verification failed"
        );
      }

      if (
        !data.verified ||
        !data.sessionId
      ) {
        throw new Error(
          "Verification failed"
        );
      }

      sessionStorage.setItem(
        `secure-media-session-${SHARE_ID}`,
        data.sessionId
      );

      setSessionId(
        data.sessionId
      );

      setVerificationStep(
        "verified"
      );

      setCode(
        ""
      );
    } catch (
      err
    ) {
      setError(
        err instanceof Error
          ? err.message
          : "Verification failed"
      );
    } finally {
      setVerificationLoading(
        false
      );
    }
  }

  /*
   * --------------------------------------------------
   * RESTORE SESSION
   * --------------------------------------------------
   */

  useEffect(() => {
    const storedSessionId =
      sessionStorage.getItem(
        `secure-media-session-${SHARE_ID}`
      );

    if (
      storedSessionId
    ) {
      setSessionId(
        storedSessionId
      );

      setVerificationStep(
        "verified"
      );
    }
  }, []);

  /*
   * --------------------------------------------------
   * SEND PRESENCE
   * --------------------------------------------------
   */

  async function sendPresence(
    currentLocation:
      LocationState
  ) {
    if (
      !sessionId
    ) {
      setError(
        "Please verify your email before sharing your location."
      );

      return false;
    }

    try {
      const response =
        await fetch(
          `${API_URL}/shares/${SHARE_ID}/presence`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              "x-session-id":
                sessionId,
            },

            body:
              JSON.stringify({
                latitude:
                  currentLocation.latitude,

                longitude:
                  currentLocation.longitude,

                accuracy:
                  currentLocation.accuracy,
              }),
          }
        );

      const data =
        await response.json();

      if (
        !response.ok
      ) {
        if (
          response.status ===
          401
        ) {
          sessionStorage.removeItem(
            `secure-media-session-${SHARE_ID}`
          );

          setSessionId(
            null
          );

          setVerificationStep(
            "email"
          );

          stopTracking();
          destroyMediaPlayer();
        }

        throw new Error(
          data.error ??
            data.reason ??
            "Failed to update presence"
        );
      }

      return true;
    } catch (
      err
    ) {
      console.error(
        "Presence update failed:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Failed to update presence"
      );

      return false;
    }
  }

  /*
   * --------------------------------------------------
   * HANDLE GPS POSITION
   * --------------------------------------------------
   */

  function handlePosition(
    position:
      GeolocationPosition
  ) {
    const currentLocation:
      LocationState = {
        latitude:
          position.coords
            .latitude,

        longitude:
          position.coords
            .longitude,

        accuracy:
          position.coords
            .accuracy,

        timestamp:
          Date.now(),
      };

    setLocation(
      currentLocation
    );

    void sendPresence(
      currentLocation
    );
  }

  /*
   * --------------------------------------------------
   * GPS ERROR
   * --------------------------------------------------
   */

  function handleLocationError(
    gpsError:
      GeolocationPositionError
  ) {
    console.error(
      "Geolocation error:",
      {
        code:
          gpsError.code,

        message:
          gpsError.message,
      }
    );

    switch (
      gpsError.code
    ) {
      case 1:
        setError(
          "Location permission is blocked for this website. Please change the browser's Location permission from Block to Allow."
        );

        break;

      case 2:
        setError(
          "The browser could not determine your location. Check that Location Services/GPS is enabled."
        );

        break;

      case 3:
        setError(
          "Getting your location timed out. Please try again."
        );

        break;

      default:
        setError(
          `Unable to get your location. GPS error code: ${gpsError.code}.`
        );
    }
  }

  /*
   * --------------------------------------------------
   * START GPS TRACKING
   * --------------------------------------------------
   */

  function startTracking() {
    setError(
      null
    );

    setResult(
      null
    );

    if (
      !sessionId
    ) {
      setError(
        "Please verify your email before starting location tracking."
      );

      return;
    }

    if (
      !navigator.geolocation
    ) {
      setError(
        "Geolocation is not supported by this browser."
      );

      return;
    }

    if (
      watchId.current !==
      null
    ) {
      return;
    }

    setTracking(
      true
    );

    watchId.current =
      navigator.geolocation.watchPosition(
        handlePosition,

        handleLocationError,

        {
          enableHighAccuracy:
            true,

          maximumAge:
            5000,

          timeout:
            15000,
        }
      );

    heartbeatId.current =
      setInterval(
        () => {
          setLocation(
            (
              currentLocation
            ) => {
              if (
                currentLocation
              ) {
                void sendPresence(
                  currentLocation
                );
              }

              return currentLocation;
            }
          );
        },
        10000
      );
  }

  /*
   * --------------------------------------------------
   * STOP GPS TRACKING
   * --------------------------------------------------
   */

  function stopTracking() {
    if (
      watchId.current !==
      null
    ) {
      navigator.geolocation.clearWatch(
        watchId.current
      );

      watchId.current =
        null;
    }

    if (
      heartbeatId.current !==
      null
    ) {
      clearInterval(
        heartbeatId.current
      );

      heartbeatId.current =
        null;
    }

    setTracking(
      false
    );
  }

  /*
   * --------------------------------------------------
   * CHECK ACCESS
   * --------------------------------------------------
   */

  async function checkAccess() {
    if (
      !sessionId
    ) {
      setError(
        "Please verify your email before checking access."
      );

      return;
    }

    setLoading(
      true
    );

    setError(
      null
    );

    setResult(
      null
    );

    destroyMediaPlayer();

    try {
      const response =
        await fetch(
          `${API_URL}/share/${SHARE_ID}/access`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              "x-session-id":
                sessionId,
            },
          }
        );

      const data =
        await response.json();

      if (
        response.status ===
        401
      ) {
        sessionStorage.removeItem(
          `secure-media-session-${SHARE_ID}`
        );

        setSessionId(
          null
        );

        setVerificationStep(
          "email"
        );

        stopTracking();
        destroyMediaPlayer();
      }

      setResult(
        data
      );
    } catch (
      err
    ) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to check access"
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  /*
   * --------------------------------------------------
   * DESTROY MEDIA PLAYER
   * --------------------------------------------------
   */

  function destroyMediaPlayer() {
    if (
      hlsRef.current
    ) {
      hlsRef.current.destroy();

      hlsRef.current =
        null;
    }

    if (
      videoRef.current
    ) {
      videoRef.current.pause();

      videoRef.current.removeAttribute(
        "src"
      );

      videoRef.current.load();
    }

    if (
      manifestBlobUrlRef.current
    ) {
      URL.revokeObjectURL(
        manifestBlobUrlRef.current
      );

      manifestBlobUrlRef.current =
        null;
    }

    setHlsManifestUrl(
      null
    );
  }

  /*
   * --------------------------------------------------
   * LOAD PROTECTED HLS MANIFEST
   * --------------------------------------------------
   */

  async function loadMedia() {
    if (
      !sessionId
    ) {
      setError(
        "Please verify your email before loading media."
      );

      return;
    }

    setMediaLoading(
      true
    );

    setError(
      null
    );

    destroyMediaPlayer();

    try {
      const response =
        await fetch(
          `${API_URL}/share/${SHARE_ID}/media`,
          {
            method:
              "GET",

            headers: {
              "x-session-id":
                sessionId,
            },

            cache:
              "no-store",
          }
        );

      /*
       * ------------------------------------------------
       * HANDLE SESSION EXPIRY
       * ------------------------------------------------
       */

      if (
        response.status ===
        401
      ) {
        let reason =
          "Your session has expired";

        try {
          const data =
            await response.json();

          reason =
            data.reason ??
            data.error ??
            reason;
        } catch {
          // Ignore JSON parsing failure.
        }

        sessionStorage.removeItem(
          `secure-media-session-${SHARE_ID}`
        );

        setSessionId(
          null
        );

        setVerificationStep(
          "email"
        );

        stopTracking();

        throw new Error(
          reason
        );
      }

      /*
       * ------------------------------------------------
       * HANDLE AUTHORIZATION FAILURE
       * ------------------------------------------------
       */

      if (
        !response.ok
      ) {
        const contentType =
          response.headers.get(
            "content-type"
          );

        let reason =
          "Media access denied";

        if (
          contentType?.includes(
            "application/json"
          )
        ) {
          const data =
            await response.json();

          reason =
            data.reason ??
            data.error ??
            reason;
        } else {
          const body =
            await response.text();

          if (
            body
          ) {
            reason =
              body;
          }
        }

        throw new Error(
          reason
        );
      }

      /*
       * ------------------------------------------------
       * SUCCESSFUL RESPONSE IS RAW .M3U8 TEXT
       * ------------------------------------------------
       */

      const manifestText =
        await response.text();

      if (
        !manifestText
          .trim()
          .startsWith(
            "#EXTM3U"
          )
      ) {
        console.error(
          "Unexpected media response:",
          manifestText
        );

        throw new Error(
          "The server did not return a valid HLS playlist."
        );
      }

      /*
       * Our API returns the manifest itself rather
       * than exposing a directly accessible manifest
       * URL.
       *
       * Every media segment inside this manifest
       * already contains its own short-lived signed
       * CloudFront URL.
       */

      const manifestBlob =
        new Blob(
          [
            manifestText,
          ],
          {
            type:
              "application/vnd.apple.mpegurl",
          }
        );

      const blobUrl =
        URL.createObjectURL(
          manifestBlob
        );

      manifestBlobUrlRef.current =
        blobUrl;

      setHlsManifestUrl(
        blobUrl
      );
    } catch (
      err
    ) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load protected media"
      );
    } finally {
      setMediaLoading(
        false
      );
    }
  }

  /*
   * --------------------------------------------------
   * INITIALIZE HLS PLAYER
   * --------------------------------------------------
   */

  useEffect(
    () => {
      if (
        !hlsManifestUrl
      ) {
        return;
      }

      const video =
        videoRef.current;

      if (
        !video
      ) {
        return;
      }

      /*
       * Prefer HLS.js when MediaSource
       * is available.
       */
      if (
        Hls.isSupported()
      ) {
        const hls =
          new Hls({
            enableWorker:
              true,
          });

        hlsRef.current =
          hls;

        hls.loadSource(
          hlsManifestUrl
        );

        hls.attachMedia(
          video
        );

        hls.on(
          Hls.Events.MANIFEST_PARSED,
          () => {
            console.log(
              "Protected HLS manifest loaded"
            );
          }
        );

        hls.on(
          Hls.Events.ERROR,
          (
            _event,
            data
          ) => {
            console.error(
              "HLS error:",
              data
            );

            if (
              data.fatal
            ) {
              switch (
                data.type
              ) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  setError(
                    "The protected video could not be downloaded. The signed media URL may have expired."
                  );

                  break;

                case Hls.ErrorTypes.MEDIA_ERROR:
                  setError(
                    "The browser encountered an HLS media playback error."
                  );

                  break;

                default:
                  setError(
                    "The protected video player encountered a fatal error."
                  );
              }
            }
          }
        );

        return () => {
          hls.destroy();

          if (
            hlsRef.current ===
            hls
          ) {
            hlsRef.current =
              null;
          }
        };
      }

      /*
       * Safari/native HLS fallback.
       */
      if (
        video.canPlayType(
          "application/vnd.apple.mpegurl"
        )
      ) {
        video.src =
          hlsManifestUrl;

        return;
      }

      setError(
        "HLS playback is not supported by this browser."
      );
    },
    [
      hlsManifestUrl,
    ]
  );

  /*
   * --------------------------------------------------
   * RESET VERIFICATION / LOGOUT
   * --------------------------------------------------
   */

  function resetVerification() {
    stopTracking();
    destroyMediaPlayer();

    sessionStorage.removeItem(
      `secure-media-session-${SHARE_ID}`
    );

    setSessionId(
      null
    );

    setEmail(
      ""
    );

    setCode(
      ""
    );

    setLocation(
      null
    );

    setResult(
      null
    );

    setError(
      null
    );

    setVerificationStep(
      "email"
    );
  }

  /*
   * --------------------------------------------------
   * CLEANUP
   * --------------------------------------------------
   */

  useEffect(
    () => {
      return () => {
        if (
          watchId.current !==
          null
        ) {
          navigator.geolocation.clearWatch(
            watchId.current
          );
        }

        if (
          heartbeatId.current !==
          null
        ) {
          clearInterval(
            heartbeatId.current
          );
        }

        if (
          hlsRef.current
        ) {
          hlsRef.current.destroy();
        }

        if (
          manifestBlobUrlRef.current
        ) {
          URL.revokeObjectURL(
            manifestBlobUrlRef.current
          );
        }
      };
    },
    []
  );

  /*
   * --------------------------------------------------
   * UI
   * --------------------------------------------------
   */

  return (
    <main
      style={{
        maxWidth:
          800,

        margin:
          "0 auto",

        padding:
          40,

        fontFamily:
          "Arial, sans-serif",
      }}
    >
      <h1>
        Secure Proximity Media
      </h1>

      <p
        style={{
          color:
            "#666",

          marginBottom:
            30,
        }}
      >
        Email verified browser GPS proximity authorization
      </p>

      <p
        style={{
          fontSize:
            13,

          color:
            "#777",

          marginTop:
            8,
        }}
      >
        Secure context:{" "}

        {isSecureContext ===
        null
          ? "Checking..."
          : isSecureContext
            ? "Yes"
            : "No"}
      </p>

      {/* EMAIL VERIFICATION */}

      <section
        style={{
          border:
            "1px solid #ddd",

          borderRadius:
            8,

          padding:
            20,

          marginBottom:
            20,
        }}
      >
        <h2>
          1. Verify Your Email
        </h2>

        {verificationStep ===
          "email" && (
          <>
            <p>
              Enter the email address that received access to this shared media.
            </p>

            <input
              type="email"
              value={
                email
              }
              onChange={
                (
                  event
                ) =>
                  setEmail(
                    event
                      .target
                      .value
                  )
              }
              placeholder="you@example.com"
              style={{
                width:
                  "100%",

                boxSizing:
                  "border-box",

                padding:
                  12,

                fontSize:
                  16,

                marginBottom:
                  12,
              }}
            />

            <button
              onClick={
                requestVerificationCode
              }
              disabled={
                verificationLoading ||
                !email.trim()
              }
              style={{
                padding:
                  "12px 20px",

                fontSize:
                  16,

                cursor:
                  verificationLoading
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {verificationLoading
                ? "Sending..."
                : "Send Verification Code"}
            </button>
          </>
        )}

        {verificationStep ===
          "code" && (
          <>
            <p>
              Enter the 6-digit verification code.
            </p>

            <p
              style={{
                fontSize:
                  13,

                color:
                  "#777",
              }}
            >
              Email:{" "}

              <strong>
                {email}
              </strong>
            </p>

            <input
              type="text"
              inputMode="numeric"
              maxLength={
                6
              }
              value={
                code
              }
              onChange={
                (
                  event
                ) =>
                  setCode(
                    event
                      .target
                      .value
                      .replace(
                        /\D/g,
                        ""
                      )
                      .slice(
                        0,
                        6
                      )
                  )
              }
              placeholder="123456"
              style={{
                width:
                  "100%",

                boxSizing:
                  "border-box",

                padding:
                  12,

                fontSize:
                  22,

                letterSpacing:
                  5,

                marginBottom:
                  12,
              }}
            />

            <div
              style={{
                display:
                  "flex",

                gap:
                  10,

                flexWrap:
                  "wrap",
              }}
            >
              <button
                onClick={
                  confirmVerificationCode
                }
                disabled={
                  verificationLoading ||
                  code.length !==
                    6
                }
                style={{
                  padding:
                    "12px 20px",

                  fontSize:
                    16,

                  cursor:
                    verificationLoading
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {verificationLoading
                  ? "Verifying..."
                  : "Verify Code"}
              </button>

              <button
                onClick={
                  () => {
                    setCode(
                      ""
                    );

                    setVerificationStep(
                      "email"
                    );
                  }
                }
                disabled={
                  verificationLoading
                }
                style={{
                  padding:
                    "12px 20px",

                  fontSize:
                    16,

                  cursor:
                    "pointer",
                }}
              >
                Change Email
              </button>
            </div>
          </>
        )}

        {verificationStep ===
          "verified" && (
          <>
            <p>
              <strong>
                ✅ Email verified
              </strong>
            </p>

            <p
              style={{
                fontSize:
                  13,

                color:
                  "#777",
              }}
            >
              Your verified session is active.
            </p>

            <button
              onClick={
                resetVerification
              }
              style={{
                padding:
                  "10px 16px",

                cursor:
                  "pointer",
              }}
            >
              Use Different Email
            </button>
          </>
        )}
      </section>

      {/* GPS */}

      <section
        style={{
          border:
            "1px solid #ddd",

          borderRadius:
            8,

          padding:
            20,

          marginBottom:
            20,

          opacity:
            verificationStep ===
            "verified"
              ? 1
              : 0.6,
        }}
      >
        <h2>
          2. Location
        </h2>

        {verificationStep !==
          "verified" && (
          <p
            style={{
              color:
                "#777",
            }}
          >
            Verify your email before starting location tracking.
          </p>
        )}

        {!tracking ? (
          <button
            onClick={
              startTracking
            }
            disabled={
              verificationStep !==
              "verified"
            }
            style={{
              padding:
                "12px 20px",

              fontSize:
                16,

              cursor:
                verificationStep ===
                "verified"
                  ? "pointer"
                  : "not-allowed",
            }}
          >
            📍 Start Location Tracking
          </button>
        ) : (
          <button
            onClick={
              stopTracking
            }
            style={{
              padding:
                "12px 20px",

              fontSize:
                16,

              cursor:
                "pointer",
            }}
          >
            ⛔ Stop Location Tracking
          </button>
        )}

        <div
          style={{
            marginTop:
              20,
          }}
        >
          <p>
            Status:{" "}

            <strong>
              {tracking
                ? "🟢 Tracking"
                : "⚪ Not tracking"}
            </strong>
          </p>

          {location ? (
            <div
              style={{
                background:
                  "#f5f5f5",

                padding:
                  15,

                borderRadius:
                  6,
              }}
            >
              <p>
                <strong>
                  Latitude:
                </strong>{" "}

                {location.latitude.toFixed(
                  6
                )}
              </p>

              <p>
                <strong>
                  Longitude:
                </strong>{" "}

                {location.longitude.toFixed(
                  6
                )}
              </p>

              <p>
                <strong>
                  Accuracy:
                </strong>{" "}

                {Math.round(
                  location.accuracy
                )}{" "}
                meters
              </p>

              <p
                style={{
                  fontSize:
                    12,

                  color:
                    "#777",
                }}
              >
                Last update:{" "}

                {new Date(
                  location.timestamp
                ).toLocaleTimeString()}
              </p>
            </div>
          ) : (
            <p
              style={{
                color:
                  "#777",
              }}
            >
              No location received yet.
            </p>
          )}
        </div>
      </section>

      {/* AUTHORIZATION */}

      <section
        style={{
          border:
            "1px solid #ddd",

          borderRadius:
            8,

          padding:
            20,

          marginBottom:
            20,

          opacity:
            verificationStep ===
            "verified"
              ? 1
              : 0.6,
        }}
      >
        <h2>
          3. Access
        </h2>

        <button
          onClick={
            checkAccess
          }
          disabled={
            loading ||
            verificationStep !==
              "verified"
          }
          style={{
            padding:
              "12px 20px",

            fontSize:
              16,

            cursor:
              loading ||
              verificationStep !==
                "verified"
                ? "not-allowed"
                : "pointer",
          }}
        >
          {loading
            ? "Checking..."
            : "Check Media Access"}
        </button>

        {result?.allowed && (
          <button
            onClick={
              loadMedia
            }
            disabled={
              mediaLoading ||
              !sessionId
            }
            style={{
              padding:
                "12px 20px",

              fontSize:
                16,

              marginLeft:
                10,

              cursor:
                mediaLoading
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {mediaLoading
              ? "Loading Media..."
              : "Open Protected Media"}
          </button>
        )}
      </section>

      {/* ERROR */}

      {error && (
        <section
          style={{
            padding:
              20,

            marginBottom:
              20,

            borderRadius:
              8,

            background:
              "#ffe5e5",

            border:
              "1px solid #cc6666",
          }}
        >
          <h3>
            ❌ Error
          </h3>

          <p>
            {error}
          </p>
        </section>
      )}

      {/* ACCESS RESULT */}

      {result && (
        <section
          style={{
            padding:
              20,

            borderRadius:
              8,

            background:
              result.allowed
                ? "#e5ffe5"
                : "#ffe5e5",

            border:
              result.allowed
                ? "1px solid #66aa66"
                : "1px solid #cc6666",
          }}
        >
          <h2>
            {result.allowed
              ? "✅ Access Allowed"
              : "❌ Access Denied"}
          </h2>

          <p>
            <strong>
              Reason:
            </strong>{" "}

            {result.reason}
          </p>

          {typeof result.distanceMeters ===
            "number" && (
            <p>
              <strong>
                Distance:
              </strong>{" "}

              {Math.round(
                result.distanceMeters
              )}{" "}
              meters
            </p>
          )}
        </section>
      )}

      {/* PROTECTED HLS MEDIA */}

      {hlsManifestUrl && (
        <section
          style={{
            padding:
              20,

            marginTop:
              20,

            border:
              "1px solid #ddd",

            borderRadius:
              8,
          }}
        >
          <h2>
            🔒 Protected Media
          </h2>

          <p
            style={{
              fontSize:
                13,

              color:
                "#777",
            }}
          >
            Protected HLS stream delivered through signed CloudFront segment URLs.
          </p>

          <video
            ref={
              videoRef
            }
            controls
            playsInline
            crossOrigin="anonymous"
            style={{
              width:
                "100%",

              maxHeight:
                500,

              background:
                "#000",
            }}
          />
        </section>
      )}

      {/* SYSTEM INFORMATION */}

      <section
        style={{
          marginTop:
            30,

          padding:
            20,

          background:
            "#f8f8f8",

          borderRadius:
            8,

          fontSize:
            13,
        }}
      >
        <h3>
          Current MVP configuration
        </h3>

        <p>
          Share: {SHARE_ID}
        </p>

        <p>
          Identity: Email verification
        </p>

        <p>
          Session: Redis verified session
        </p>

        <p>
          Location heartbeat: 10 seconds
        </p>

        <p>
          Presence TTL: 120 seconds
        </p>

        <p>
          Session TTL: 1 hour
        </p>

        <p>
          Media delivery: Protected HLS
        </p>

        <p>
          CDN: CloudFront signed segment URLs
        </p>
      </section>
    </main>
  );
}