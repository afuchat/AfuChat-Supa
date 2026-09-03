import { useState, useCallback } from "react";
import * as Location from "expo-location";
import { Platform } from "react-native";
import { showAlert } from "@/lib/alert";

export interface NearbyCoords {
  lat: number;
  lng: number;
  source: "gps" | "ip";
}

async function getCoordsByIp(): Promise<NearbyCoords | null> {
  const endpoints: { url: string; parse: (d: any) => NearbyCoords | null }[] = [
    {
      url: "https://ipapi.co/json/",
      parse: (d) =>
        d?.latitude && d?.longitude
          ? { lat: d.latitude, lng: d.longitude, source: "ip" }
          : null,
    },
    {
      url: "https://ip-api.com/json/?fields=status,lat,lon",
      parse: (d) =>
        d?.status === "success" && d?.lat && d?.lon
          ? { lat: d.lat, lng: d.lon, source: "ip" }
          : null,
    },
    {
      url: "https://ipwho.is/",
      parse: (d) =>
        d?.success && d?.latitude && d?.longitude
          ? { lat: d.latitude, lng: d.longitude, source: "ip" }
          : null,
    },
  ];

  for (const ep of endpoints) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(ep.url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      const result = ep.parse(data);
      if (result) return result;
    } catch {}
  }
  return null;
}

export interface UseNearbyLocationResult {
  coords: NearbyCoords | null;
  locating: boolean;
  error: string | null;
  permissionStatus: "unknown" | "granted" | "denied";
  requestLocation: () => Promise<NearbyCoords | null>;
  clearCoords: () => void;
}

export function useNearbyLocation(): UseNearbyLocationResult {
  const [coords, setCoords] = useState<NearbyCoords | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<"unknown" | "granted" | "denied">("unknown");

  const requestLocation = useCallback(async (): Promise<NearbyCoords | null> => {
    setLocating(true);
    setError(null);

    // expo-location does not implement the permission API on web. Use the
    // existing IP fallback directly rather than leaving the hook stuck in its
    // locating state after a rejected native-only call.
    if (Platform.OS === "web") {
      setPermissionStatus("granted");
      const ip = await getCoordsByIp();
      if (ip) {
        setCoords(ip);
        setLocating(false);
        return ip;
      }
      setError("Could not determine your location. Please try again.");
      setLocating(false);
      return null;
    }

    let granted = false;
    try {
      const { status: existing } = await Location.getForegroundPermissionsAsync();
      granted = existing === "granted";
    } catch {
      setPermissionStatus("denied");
    }

    if (!granted) {
      await new Promise<void>((resolve) => {
        showAlert(
          "Find Nearby Friends",
          "AfuChat will use your device location to show AfuChat users near you.\n\nYour location is only used while the Nearby tab is open and is never shared with other users without your consent.",
          [
            {
              text: "Not Now",
              style: "cancel",
              onPress: () => resolve(),
            },
            {
              text: "Allow Location",
              onPress: async () => {
                 try {
                   const { status } = await Location.requestForegroundPermissionsAsync();
                   granted = status === "granted";
                 } catch {
                   granted = false;
                 }
                resolve();
              },
            },
          ],
        );
      });
    }

    if (granted) {
      setPermissionStatus("granted");
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          maximumAge: 60_000,
          timeout: 10_000,
        } as any);
        const result: NearbyCoords = {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          source: "gps",
        };
        setCoords(result);
        setLocating(false);
        return result;
      } catch {
        // GPS timed out or unavailable — fall through to IP
      }
    } else {
      setPermissionStatus("denied");
    }

    const ip = await getCoordsByIp();
    if (ip) {
      setCoords(ip);
      setLocating(false);
      return ip;
    }

    setError(
      granted
        ? "Could not get your GPS location. Make sure location services are enabled and try again."
        : "Location permission denied. Enable it in your device settings to find nearby friends."
    );
    setLocating(false);
    return null;
  }, []);

  const clearCoords = useCallback(() => {
    setCoords(null);
    setError(null);
  }, []);

  return { coords, locating, error, permissionStatus, requestLocation, clearCoords };
}
