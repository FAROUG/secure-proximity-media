
"use client";

import { useEffect, useRef, useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";

const SHARE_ID =
  "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const PERSON_A_ID =
  "11111111-1111-1111-1111-111111111111";

const PERSON_B_ID =
  "22222222-2222-2222-2222-222222222222";

type UserType = "A" | "B";

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

export default function Home() {
  const [selectedUser, setSelectedUser] =
    useState<UserType>("B");

  const [location, setLocation] =
    useState<LocationState | null>(null);

  const [result, setResult] =
    useState<AccessResult | null>(null);
  
  const [isSecureContext, setIsSecureContext] = 
    useState<boolean | null>(null);

  useEffect(() => {
    setIsSecureContext(window.isSecureContext);
  }, []);

  const [error, setError] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [tracking, setTracking] =
    useState(false);

  const watchId =
    useRef<number | null>(null);

  const heartbeatId =
    useRef<ReturnType<
      typeof setInterval
    > | null>(null);

  const userId =
    selectedUser === "A"
      ? PERSON_A_ID
      : PERSON_B_ID;

  /*
   * Send current location to backend.
   */
  async function sendPresence(
    currentLocation: LocationState
  ) {
    try {
      const response =
        await fetch(
          `${API_URL}/shares/${SHARE_ID}/presence/${userId}`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
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
   * Convert browser GeolocationPosition
   * into our internal location structure.
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

      timestamp: Date.now(),
    };

    setLocation(currentLocation);

    /*
     * Immediately send the new
     * location to the backend.
     */
    sendPresence(currentLocation);
  }

  // function handleLocationError(
  //   error: GeolocationPositionError
  // ) {
  //   console.error(
  //     "Geolocation error:",
  //     error
  //   );

  //   let message =
  //     "Unable to get your location.";

  //   switch (error.code) {
  //     case error.PERMISSION_DENIED:
  //       message =
  //         "Location permission was denied. Please allow location access in your browser.";
  //       break;

  //     case error.POSITION_UNAVAILABLE:
  //       message =
  //         "Your current location is unavailable.";
  //       break;

  //     case error.TIMEOUT:
  //       message =
  //         "The request to get your location timed out.";
  //       break;
  //   }

  //   setError(message);
  // }
  function handleLocationError(
  gpsError: GeolocationPositionError
) {
  console.error("Geolocation error:", {
    code: gpsError.code,
    message: gpsError.message,
    PERMISSION_DENIED:
      gpsError.PERMISSION_DENIED,
    POSITION_UNAVAILABLE:
      gpsError.POSITION_UNAVAILABLE,
    TIMEOUT:
      gpsError.TIMEOUT,
  });

  let message =
    "Unable to get your current location.";

  switch (gpsError.code) {
    case gpsError.PERMISSION_DENIED:
      message =
        "Location permission was denied. Please allow location access for this website in your browser and device settings.";
      break;
    // case gpsError.PERMISSION_DENIED:
    //   message =
    //     "Location permission was denied. Please allow location access for this website in your phone settings.";
    //   break;

    case gpsError.POSITION_UNAVAILABLE:
      message =
        "Your phone could not determine its current location. Make sure Location Services/GPS is enabled.";
      break;

    case gpsError.TIMEOUT:
      message =
        "Getting your location timed out. Please try again.";
      break;

    default:
      message =
        `Unable to get your location. GPS error code: ${gpsError.code}.`;
  }

  setError(message);
}

  /*
   * Start continuous GPS tracking.
   */
  function startTracking() {
    setError(null);

    if (!navigator.geolocation) {
      setError(
        "Geolocation is not supported by this browser."
      );

      return;
    }

    setTracking(true);

    /*
     * Get the location immediately.
     */
    navigator.geolocation.getCurrentPosition(
      handlePosition,
      handleLocationError,
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );

    /*
     * Continue watching the device.
     */
    watchId.current =
      navigator.geolocation.watchPosition(
        handlePosition,
        handleLocationError,
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 15000,
        }
      );

    /*
     * Also send a heartbeat every 10 seconds.
     *
     * This is important because the Redis
     * presence record expires.
     */
    heartbeatId.current =
      setInterval(() => {
        setLocation(
          (currentLocation) => {
            if (currentLocation) {
              sendPresence(
                currentLocation
              );
            }

            return currentLocation;
          }
        );
      }, 10000);
  }

  /*
   * Stop GPS tracking.
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

    setTracking(false);
  }

  /*
   * Check whether the current user
   * can access the share.
   */
  async function checkAccess() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response =
        await fetch(
          `${API_URL}/share/${SHARE_ID}/access`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              userId,
            }),
          }
        );

      const data =
        await response.json();

      setResult(data);

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to check access"
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * When switching between A and B,
   * clear the current UI state.
   */
  function selectUser(
    user: UserType
  ) {
    stopTracking();

    setSelectedUser(user);
    setLocation(null);
    setResult(null);
    setError(null);
  }

  /*
   * Cleanup when the page is closed.
   */
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, []);

  return (
    <main
      style={{
        maxWidth: 800,
        margin: "0 auto",
        padding: 40,
        fontFamily:
          "Arial, sans-serif",
      }}
    >
      <h1>
        Secure Proximity Media
      </h1>

      <p
        style={{
          color: "#666",
          marginBottom: 30,
        }}
      >
        Real browser GPS proximity
        authorization
      </p>

      {/* USER */}

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <h2>1. Select Viewer</h2>

        <div
          style={{
            display: "flex",
            gap: 10,
          }}
        >
          <button
            onClick={() =>
              selectUser("A")
            }
            style={{
              padding:
                "12px 20px",
              borderRadius: 6,
              border:
                selectedUser === "A"
                  ? "2px solid black"
                  : "1px solid #ccc",
              background:
                selectedUser === "A"
                  ? "#eee"
                  : "white",
              cursor: "pointer",
            }}
          >
            Person A
          </button>

          <button
            onClick={() =>
              selectUser("B")
            }
            style={{
              padding:
                "12px 20px",
              borderRadius: 6,
              border:
                selectedUser === "B"
                  ? "2px solid black"
                  : "1px solid #ccc",
              background:
                selectedUser === "B"
                  ? "#eee"
                  : "white",
              cursor: "pointer",
            }}
          >
            Person B
          </button>
        </div>

        <p
          style={{
            marginTop: 15,
          }}
        >
          Current user:{" "}
          <strong>
            Person {selectedUser}
          </strong>
        </p>

        <p
          style={{
            fontSize: 12,
            color: "#777",
            wordBreak: "break-all",
          }}
        >
          Temporary user ID:
          <br />
          {userId}
        </p>
      </section>

      {/* GPS */}

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <h2>2. Location</h2>

        {!tracking ? (
          <button
            onClick={startTracking}
            style={{
              padding:
                "12px 20px",
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            📍 Start Location Tracking
          </button>
        ) : (
          <button
            onClick={stopTracking}
            style={{
              padding:
                "12px 20px",
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            ⛔ Stop Location Tracking
          </button>
        )}

        <div
          style={{
            marginTop: 20,
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
                padding: 15,
                borderRadius: 6,
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
                  fontSize: 12,
                  color: "#777",
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
                color: "#777",
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
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <h2>3. Access</h2>

        <button
          onClick={checkAccess}
          disabled={loading}
          style={{
            padding:
              "12px 20px",
            fontSize: 16,
            cursor: loading
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
            padding: 20,
            marginBottom: 20,
            borderRadius: 8,
            background:
              "#ffe5e5",
            border:
              "1px solid #cc6666",
          }}
        >
          <h3>❌ Error</h3>

          <p>{error}</p>
        </section>
      )}

      {/* RESULT */}

      {result && (
        <section
          style={{
            padding: 20,
            borderRadius: 8,
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
          marginTop: 30,
          padding: 20,
          background:
            "#f8f8f8",
          borderRadius: 8,
          fontSize: 13,
        }}
      >
        <h3>
          Current MVP configuration
        </h3>

        <p>
          Share:{" "}
          {SHARE_ID}
        </p>

        <p>
          Person A: Unrestricted
        </p>

        <p>
          Person B: Proximity
          restricted
        </p>

        <p>
          Maximum distance:
          500m
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
          Identity:
          Temporary client-supplied
          user ID
        </p>
      </section>
    </main>
  );
}