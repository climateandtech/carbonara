// == Non compliant Code Example (Web)

// ruleid: gci523-javascript-sobriety-thrifty-geolocation-mintime
var options_web_noncompliant = {
  enableHighAccuracy: true,
  timeout: 5000,
  maximumAge: 0,
};
navigator.geolocation.getCurrentPosition(
  (pos) => console.log(pos),
  (err) => console.warn(err),
  options_web_noncompliant
);

// == Compliant Solution (Web)

// ok: gci523-javascript-sobriety-thrifty-geolocation-mintime
navigator.geolocation.getCurrentPosition((pos) => console.log(pos));

// ok: gci523-javascript-sobriety-thrifty-geolocation-mintime
var options_web_compliant = {
  enableHighAccuracy: false,
  timeout: 5000,
  maximumAge: 0,
};
navigator.geolocation.getCurrentPosition(
  (pos) => console.log(pos),
  (err) => console.warn(err),
  options_web_compliant
);

// == Non compliant Code Example (React Native)

import * as Location from "expo-location";
// ruleid: gci523-javascript-sobriety-thrifty-geolocation-mintime
Location.enableNetworkProviderAsync();

// == Compliant Solution (React Native)

// ok: gci523-javascript-sobriety-thrifty-geolocation-mintime
import * as LocationCompliant from "expo-location";
LocationCompliant.requestPermissionsAsync();
