import React from "react";
import { SearchScreen } from "../../app/(tabs)/search";

// AfuSearch is the full-screen mini-app variant. It reuses the same search
// engine and result views without importing the route's duplicate shell.
export default function AfuSearch() {
  return <SearchScreen title="AfuSearch" />;
}