"use client";

import { useEffect, useRef, useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";

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

  const [verificationStep, setVerificationStep] =
    useState<VerificationStep>("email");

  const [email, setEmail] =
    useState("");

  const [code, setCode] =
    useState("");

  const [sessionId, setSessionId] =
    useState<string | null>(null);

  const [verificationLoading, setVerificationLoading] =
    useState(false);


  /*
   * --------------------------------------------------
   * LOCATION / ACCESS STATE
   * --------------------------------------------------
   */

  const [location, setLocation] =
    useState<LocationState | null>(null);

  const [result, setResult] =
    useState<AccessResult | null>(null);

  const [isSecureContext, setIsSecureContext] =
    useState<boolean | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [tracking, setTracking] =
    useState(false);


  /*
   * --------------------------------------------------
   * REFS
   * --------------------------------------------------
   */

  const watchId =
    useRef<number | null>(null);

  const heartbeatId =
    useRef<ReturnType<
      typeof setInterval
    > | null>(null);


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

    setVerificationLoading(true);
    setError(null);

    try {

      const response =
        await fetch(
          `${API_URL}/share/${SHARE_ID}/verify/request`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              email:
                email
                  .trim()
                  .toLowerCase(),
            }),
          }
        );


      const data =
        await response.json();


      if (!response.ok) {

        throw new Error(
          data.error ??
          "Failed to request verification code"
        );

      }


      /*
       * Move to code entry.
       *
       * We intentionally do not depend
       * on the backend revealing whether
       * the email is authorized.
       */
      setVerificationStep(
        "code"
      );


    } catch (err) {

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

    setVerificationLoading(true);
    setError(null);

    try {

      const response =
        await fetch(
          `${API_URL}/share/${SHARE_ID}/verify/confirm`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
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


      if (!response.ok) {

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


      /*
       * MVP STORAGE
       *
       * We store the session temporarily
       * in sessionStorage.
       *
       * Later we can move this to an
       * HttpOnly Secure cookie.
       */
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


      setCode("");

    } catch (err) {

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
   * RESTORE SESSION ON PAGE REFRESH
   * --------------------------------------------------
   */

  useEffect(() => {

    const storedSessionId =
      sessionStorage.getItem(
        `secure-media-session-${SHARE_ID}`
      );


    if (storedSessionId) {

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
    currentLocation: LocationState
  ) {

    if (!sessionId) {

      setError(
        "Please verify your email before sharing your location."
      );

      return false;

    }


    try {

      const response =
        await fetch(
          `${API_URL}/shares/${SHARE_ID}/presence`,
          // Change API_URL to NEXT_PUBLIC_API_URL
          // `${process.env.NEXT_PUBLIC_API_URL}/shares/${SHARE_ID}/presence`,
          {
            method: "POST",

            headers: {

              "Content-Type":
                "application/json",

              "x-session-id":
                sessionId,

            },

            body: JSON.stringify({

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


      if (!response.ok) {

        /*
         * Session expired or invalid.
         */
        if (
          response.status === 401
        ) {

          sessionStorage.removeItem(
            `secure-media-session-${SHARE_ID}`
          );

          setSessionId(null);

          setVerificationStep(
            "email"
          );

          stopTracking();

        }


        throw new Error(
          data.error ??
          "Failed to update presence"
        );

      }


      return true;

    } catch (err) {

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
    position: GeolocationPosition
  ) {

    const currentLocation: LocationState = {

      latitude:
        position.coords.latitude,

      longitude:
        position.coords.longitude,

      accuracy:
        position.coords.accuracy,

      timestamp:
        Date.now(),

    };


    setLocation(
      currentLocation
    );


    /*
     * Immediately send location.
     */
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
    gpsError: GeolocationPositionError
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

    setError(null);
    setResult(null);


    if (!sessionId) {

      setError(
        "Please verify your email before starting location tracking."
      );

      return;

    }


    if (!navigator.geolocation) {

      setError(
        "Geolocation is not supported by this browser."
      );

      return;

    }


    if (
      watchId.current !== null
    ) {
      return;
    }


    setTracking(true);


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


    /*
     * Renew Redis presence
     * every 10 seconds.
     */
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
      watchId.current !== null
    ) {

      navigator.geolocation.clearWatch(
        watchId.current
      );

      watchId.current = null;

    }


    if (
      heartbeatId.current !== null
    ) {

      clearInterval(
        heartbeatId.current
      );

      heartbeatId.current = null;

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

    if (!sessionId) {

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


      /*
       * Session expired.
       */
      if (
        response.status === 401
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

      }


      setResult(
        data
      );

    } catch (err) {

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
   * CHANGE EMAIL / LOG OUT
   * --------------------------------------------------
   */

  function resetVerification() {

    stopTracking();


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

  useEffect(() => {

    return () => {

      if (
        watchId.current !== null
      ) {

        navigator.geolocation.clearWatch(
          watchId.current
        );

      }


      if (
        heartbeatId.current !== null
      ) {

        clearInterval(
          heartbeatId.current
        );

      }

    };

  }, []);


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

        {isSecureContext === null
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

              value={email}

              onChange={
                (event) =>
                  setEmail(
                    event.target.value
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

              maxLength={6}

              value={code}

              onChange={
                (event) =>
                  setCode(
                    event.target.value
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
                  code.length !== 6
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
            verificationStep === "verified"
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
                "#777"
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
              20
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
                  "#777"
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


      {/* RESULT */}

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
          Location heartbeat:
          10 seconds
        </p>


        <p>
          Presence TTL:
          120 seconds
        </p>


        <p>
          Session TTL:
          1 hour
        </p>

      </section>

    </main>

  );
}