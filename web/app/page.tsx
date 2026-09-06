
"use client";

import { useEffect, useRef, useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";
  // console.log("API_URL:", API_URL);

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

  function handleLocationError(
  gpsError: GeolocationPositionError
) {
  console.error("Geolocation error:", {
    code: gpsError.code,
    message: gpsError.message,
  });

  switch (gpsError.code) {
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
   * Start continuous GPS tracking.
   */
  function startTracking() {
    setError(null);
    setResult(null);

    if (!navigator.geolocation) {
      setError(
        "Geolocation is not supported by this browser."
      );

      return;
    }

    if (watchId.current !== null) {
      return;
    }

    setTracking(true);

    /*
     * Start continuous GPS tracking.
     *
     * watchPosition() will provide the
     * initial position and subsequent updates.
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
     * Renew Redis presence every 10 seconds.
     */
    heartbeatId.current =
      setInterval(() => {
        setLocation(
          (currentLocation) => {
            if (currentLocation) {
              void sendPresence(
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

      <p
        style={{
          fontSize: 13,
          color: "#777",
          marginTop: 8,
        }}
        >
        {/* Secure context:{" "}
        {typeof window !== "undefined" &&
        window.isSecureContext
          ? "Yes"
          : "No"} */}
        Secure context:{" "}
        {isSecureContext === null
          ? "Checking..."
          : isSecureContext
          ? "Yes"
          : "No"}
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