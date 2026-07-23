import { useState, useMemo } from "react";

// ----- Data -----

const COUNTRIES = [
  "United States",
  "Canada",
  "United Kingdom",
  "Australia",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Netherlands",
  "Brazil",
  "Mexico",
  "Japan",
  "South Korea",
  "India",
  "Singapore",
  "United Arab Emirates",
  "South Africa",
  "New Zealand",
  "Ireland",
  "Sweden",
] as const;

type Country = (typeof COUNTRIES)[number];

const PROVINCES_BY_COUNTRY: Record<string, string[]> = {
  "United States": [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
    "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
    "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
    "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
    "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
    "New Hampshire", "New Jersey", "New Mexico", "New York",
    "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
    "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
    "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
    "West Virginia", "Wisconsin", "Wyoming",
  ],
  Canada: [
    "Alberta", "British Columbia", "Manitoba", "New Brunswick",
    "Newfoundland and Labrador", "Nova Scotia", "Ontario",
    "Prince Edward Island", "Quebec", "Saskatchewan",
    "Northwest Territories", "Nunavut", "Yukon",
  ],
  "United Kingdom": ["England", "Scotland", "Wales", "Northern Ireland"],
  Australia: [
    "New South Wales", "Victoria", "Queensland", "Western Australia",
    "South Australia", "Tasmania", "Australian Capital Territory",
    "Northern Territory",
  ],
};

const CATEGORIES = [
  "Roofing",
  "Plumbing",
  "Dental",
  "Law Firm",
  "Real Estate Agent",
  "Restaurant",
  "Gym",
  "Salon",
  "Auto Repair",
  "Electrician",
  "HVAC",
  "Landscaping",
  "Painting",
  "Cleaning Service",
  "Chiropractor",
  "Veterinarian",
  "Accountant",
  "Insurance Agent",
  "Photographer",
  "Bakery",
  "Florist",
  "Pet Grooming",
  "Tutoring",
  "Massage Therapy",
  "Moving Company",
  "Pest Control",
  "Locksmith",
  "Catering",
  "Daycare",
  "Funeral Home",
] as const;

type Category = (typeof CATEGORIES)[number];

// ----- Helpers -----

function hasPreloadedProvinces(country: string): boolean {
  return country in PROVINCES_BY_COUNTRY;
}

// ----- Component -----

type ScanStatus = "idle" | "scanning" | "success" | "error";

export default function Home() {
  const [country, setCountry] = useState<string>("United States");
  const [province, setProvince] = useState<string>("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState<string>("");
  const [otherCategory, setOtherCategory] = useState("");

  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [scanResult, setScanResult] = useState<{
    scanId: number;
    businessCount: number;
    message: string;
  } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const provinces = useMemo(() => PROVINCES_BY_COUNTRY[country] ?? [], [country]);
  const showProvinceDropdown = hasPreloadedProvinces(country);

  // Reset province when country changes
  const handleCountryChange = (value: string) => {
    setCountry(value);
    setProvince("");
  };

  const effectiveCategory = category === "Other" ? otherCategory.trim() : category;
  const canScan =
    city.trim().length > 0 &&
    effectiveCategory.length > 0 &&
    scanStatus !== "scanning";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canScan) return;

    const payload = {
      country,
      province: showProvinceDropdown ? province : province.trim(),
      city: city.trim(),
      category: effectiveCategory,
    };

    setScanStatus("scanning");
    setScanResult(null);
    setScanError(null);

    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      setScanResult(data);
      setScanStatus("success");
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Unknown error");
      setScanStatus("error");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-950">
      {/* ----- Navbar ----- */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-sm font-extrabold text-gray-950">
              LH
            </span>
            LeadHunter <span className="text-amber-500">AI</span>
          </a>
        </div>
      </header>

      {/* ----- Hero ----- */}
      <section className="px-6 pt-16 pb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Find Your Next Clients{" "}
          <span className="text-amber-500">Instantly</span>
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-gray-400">
          Scan an entire city for businesses in any category, analyze their online
          presence, and get a prioritized lead list — all in minutes.
        </p>
      </section>

      {/* ----- Form Card ----- */}
      <div className="mx-auto w-full max-w-xl px-6 pb-20">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-xl shadow-black/30 sm:p-8"
        >
          {/* Country */}
          <div className="mb-5">
            <label htmlFor="country" className="mb-1.5 block text-sm font-medium text-gray-300">
              Country
            </label>
            <select
              id="country"
              value={country}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-white 
                         focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500
                         appearance-none cursor-pointer"
            >
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Province / State */}
          <div className="mb-5">
            <label htmlFor="province" className="mb-1.5 block text-sm font-medium text-gray-300">
              {country === "United States"
                ? "State"
                : country === "Canada"
                  ? "Province / Territory"
                  : country === "United Kingdom"
                    ? "Country"
                    : country === "Australia"
                      ? "State / Territory"
                      : "Province / State"}
            </label>
            {showProvinceDropdown ? (
              <select
                id="province"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-white 
                           focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500
                           appearance-none cursor-pointer"
              >
                <option value="">-- Select --</option>
                {provinces.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="province"
                type="text"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                placeholder="Enter province, region, or state"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-white 
                           placeholder:text-gray-500
                           focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            )}
          </div>

          {/* City */}
          <div className="mb-5">
            <label htmlFor="city" className="mb-1.5 block text-sm font-medium text-gray-300">
              City
            </label>
            <input
              id="city"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Austin, Manchester, Melbourne"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-white 
                         placeholder:text-gray-500
                         focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* Business Category */}
          <div className="mb-5">
            <label htmlFor="category" className="mb-1.5 block text-sm font-medium text-gray-300">
              Business Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-white 
                         focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500
                         appearance-none cursor-pointer"
            >
              <option value="">-- Select a category --</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="Other">Other…</option>
            </select>
          </div>

          {/* Other Category input */}
          {category === "Other" && (
            <div className="mb-5 -mt-2 animate-in fade-in">
              <label htmlFor="otherCategory" className="mb-1.5 block text-sm font-medium text-gray-300">
                Specify Category
              </label>
              <input
                id="otherCategory"
                type="text"
                value={otherCategory}
                onChange={(e) => setOtherCategory(e.target.value)}
                placeholder="e.g. Wedding Planner, Solar Installer"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-white 
                           placeholder:text-gray-500
                           focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canScan}
            className="mt-2 w-full rounded-lg py-3 text-sm font-semibold tracking-wide transition-all duration-200
                       enabled:bg-amber-500 enabled:text-gray-950 enabled:hover:bg-amber-400 enabled:active:scale-[0.98]
                       disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-600"
          >
            {scanStatus === "scanning" ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Scanning {city || "City"}...
              </span>
            ) : (
              "Scan City"
            )}
          </button>

          {/* Success message */}
          {scanStatus === "success" && scanResult && (
            <div className="mt-4 rounded-lg border border-green-800 bg-green-950/50 px-4 py-3 text-sm text-green-300">
              <p className="font-semibold">✅ {scanResult.message}</p>
              <p className="mt-1 text-green-400/70">
                Scan ID: {scanResult.scanId} &middot; {scanResult.businessCount} businesses discovered
              </p>
            </div>
          )}

          {/* Error message */}
          {scanStatus === "error" && scanError && (
            <div className="mt-4 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
              <p className="font-semibold">❌ Scan failed</p>
              <p className="mt-1 text-red-400/70">{scanError}</p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
