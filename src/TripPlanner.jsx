import React, { useEffect, useRef, useState } from "react";
import { Home, CalendarDays, Map as MapIcon, Bell, ChevronLeft, Croissant, Landmark, Utensils, TrainFront, MapPin, X, Pencil, Trash2, Plus, FileText, Search, Loader2, ShoppingBag, Coffee, Camera, BedDouble, Wine } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Bump the "-vN" suffix on PINS_STORAGE_KEY / ITINERARY_STORAGE_KEY whenever
// DEFAULT_PINS or the default `days` itinerary below changes. Saved data in
// localStorage always wins over these defaults, so without a version bump a
// content update here would silently never reach anyone who already opened
// the app (their old cached copy just keeps loading forever).
const PINS_STORAGE_KEY = "trip-planner-pins-v3";
const ITINERARY_STORAGE_KEY = "trip-planner-itinerary-v2";
const ATTACHMENTS_STORAGE_KEY = "trip-planner-attachments";

const ICONS = { trainFront: TrainFront, landmark: Landmark, utensils: Utensils, croissant: Croissant, mapPin: MapPin };
const ICON_OPTIONS = [
  { key: "landmark", label: "Sight", icon: Landmark },
  { key: "utensils", label: "Food", icon: Utensils },
  { key: "croissant", label: "Cafe", icon: Croissant },
  { key: "trainFront", label: "Transit", icon: TrainFront },
  { key: "mapPin", label: "Other", icon: MapPin },
];

// Category → Google-Maps-style pin glyph + color for saved/dropped pins.
const PIN_CATEGORIES = {
  hotel: { label: "Hotel", icon: BedDouble, color: "#7c5cbf" },
  restaurant: { label: "Restaurant", icon: Utensils, color: "#d9534f" },
  cafe: { label: "Cafe", icon: Coffee, color: "#c17f3e" },
  shopping: { label: "Shopping", icon: ShoppingBag, color: "#2f9e6e" },
  museum: { label: "Museum", icon: Landmark, color: "#3f6593" },
  sight: { label: "Sight", icon: Camera, color: "#d97a4d" },
  bar: { label: "Bar", icon: Wine, color: "#a83279" },
  other: { label: "Other", icon: MapPin, color: "#5b86b6" },
};
const PIN_CATEGORY_OPTIONS = Object.entries(PIN_CATEGORIES).map(([key, v]) => ({ key, ...v }));

// Raw lucide path data for the categories above, hand-copied so the map pin
// glyphs can be built as plain SVG strings for Leaflet's DivIcon — pulling in
// react-dom/server just to render these would nearly double the JS bundle.
const PIN_CATEGORY_PATHS = {
  hotel: [["path", "M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"], ["path", "M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"], ["path", "M12 4v6"], ["path", "M2 18h20"]],
  restaurant: [["path", "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"], ["path", "M7 2v20"], ["path", "M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"]],
  cafe: [["path", "M10 2v2"], ["path", "M14 2v2"], ["path", "M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"], ["path", "M6 2v2"]],
  shopping: [["path", "M16 10a4 4 0 0 1-8 0"], ["path", "M3.103 6.034h17.794"], ["path", "M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"]],
  museum: [["path", "M10 18v-7"], ["path", "M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"], ["path", "M14 18v-7"], ["path", "M18 18v-7"], ["path", "M3 22h18"], ["path", "M6 18v-7"]],
  sight: [["path", "M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"], ["circle", "12,13,3"]],
  bar: [["path", "M8 22h8"], ["path", "M7 10h10"], ["path", "M12 15v7"], ["path", "M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z"]],
  other: [["path", "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"], ["circle", "12,10,3"]],
};

function categoryIconSvg(category, size = 15) {
  const shapes = PIN_CATEGORY_PATHS[category] || PIN_CATEGORY_PATHS.other;
  const inner = shapes
    .map(([tag, val]) => {
      if (tag === "circle") {
        const [cx, cy, r] = val.split(",");
        return `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
      }
      return `<path d="${val}"/>`;
    })
    .join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

const routeStops = [
  { name: "Magdeburg", lat: 52.1205, lng: 11.6276 },
  { name: "Amsterdam", lat: 52.3676, lng: 4.9041 },
  { name: "Brussels", lat: 50.8503, lng: 4.3517 },
];

const DEFAULT_PINS = [
  { id: "hotel-satellite", name: "Hotel Satellite", address: "Rue Franklin 157, 1000 Brussels, Belgium", lat: 50.8466897, lng: 4.3907001, category: "hotel" },
  { id: "the-crown-hotel", name: "The Crown Hotel", address: "21 Oudezijds Voorburgwal, Amsterdam City Centre, 1012 EH Amsterdam, Netherlands", lat: 52.3748641, lng: 4.8998972, category: "hotel" },
  // From the "Amsterdam & Brussels" Google My Maps layer
  { id: "albert-cuyp-markt", name: "Albert Cuyp Markt", address: "Albert Cuypstraat, Amsterdam", lat: 52.3559, lng: 4.8926, category: "shopping" },
  { id: "bunbun", name: "BunBun", address: "Prinsengracht, Jordaan, Amsterdam", lat: 52.3788425, lng: 4.8865337, category: "cafe" },
  { id: "grachtengordel", name: "Grachtengordel", address: "Egelantiersgracht, Jordaan, Amsterdam", lat: 52.371979, lng: 4.8847268, category: "sight" },
  { id: "bon-burger-west", name: "Bon Burger West", address: "Jacob van Lennepkade, Amsterdam", lat: 52.3629741, lng: 4.8622382, category: "restaurant" },
  { id: "bar-kaat", name: "Bar Kaat", address: "Ten Katestraat, Amsterdam", lat: 52.3673756, lng: 4.8667214, category: "bar" },
  { id: "lush-leidsestraat", name: "Lush", address: "Leidsestraat, Amsterdam", lat: 52.3665436, lng: 4.8874791, category: "shopping" },
  { id: "lush-kalverstraat", name: "LUSH", address: "Kalverstraat, Amsterdam", lat: 52.3692732, lng: 4.8911192, category: "shopping" },
  { id: "t-pareltje", name: "'t Pareltje", address: "Tweede Tuindwarsstraat, Jordaan, Amsterdam", lat: 52.3772302, lng: 4.8818957, category: "restaurant" },
];

const DAY_COLORS = ["#3f6593", "#8a63d2", "#d97a4d", "#2f9e6e", "#c0587a"];

const palette = {
  paleSky: "#c0e6fd",
  steel: "#80aad3",
  slate: "#5b86b6",
  denim: "#3f6593",
  navy: "#1b3554",
  ink: "#000f22",
};

const IMG = {
  hero: "https://images.unsplash.com/photo-1500835556837-99ac94a94552?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8dHJhdmVsfGVufDB8fDB8fHwy",
  amsterdam: "https://images.unsplash.com/photo-1583295125721-766a0088cd3f?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8dHJhdmVsJTIwYW1zdGVyZGFtfGVufDB8MXwwfHx8Mg%3D%3D",
  brussels: "https://images.unsplash.com/photo-1575659868234-aae7cc621f8f?q=80&w=870&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  brusselsHome: "https://images.unsplash.com/photo-1573995890753-a4f23342db17?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MXx8YnJ1c3NlbHN8ZW58MHwxfDB8fHwy",
  tripBg: "https://images.unsplash.com/photo-1690745778118-d0638d059f70?q=80&w=774&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
};

const days = [
  {
    label: "Mon 21",
    full: "Monday, 21 September",
    city: "Amsterdam",
    stops: [
      { time: "06:33", title: "Leave home", note: "Tram STR4 to ZOB Magdeburg", icon: "trainFront", lat: 52.1315634, lng: 11.624659, place: "Home" },
      { time: "07:00", title: "FlixBus N1325 departs", note: "ZOB Magdeburg → Amsterdam Sloterdijk", icon: "trainFront", lat: 52.1315634, lng: 11.624659, place: "ZOB Magdeburg" },
      { time: "15:00", title: "Arrive Sloterdijk", note: "FlixBus N1325 from Magdeburg", icon: "trainFront", lat: 52.3888, lng: 4.8384, place: "Amsterdam Sloterdijk" },
      { time: "15:14", title: "Board IC 2342 to Amsterdam Centraal", note: "~6 min · tap your contactless card in and out — no ticket needed", icon: "trainFront", lat: 52.3888, lng: 4.8384, place: "Amsterdam Sloterdijk" },
      { time: "16:30", title: "Jordaan wander", note: "Canal houses, no ticket needed", icon: "landmark", lat: 52.3745, lng: 4.8822, place: "Jordaan" },
      { time: "18:30", title: "Foodhallen", note: "Dinner — budget food market", icon: "utensils", lat: 52.3669, lng: 4.8698, place: "Foodhallen" },
    ],
  },
  {
    label: "Tue 22",
    full: "Tuesday, 22 September",
    city: "Amsterdam",
    stops: [
      { time: "09:00", title: "Albert Cuyp Market", note: "Breakfast, stroopwafels", icon: "croissant", lat: 52.3559, lng: 4.8926, place: "Albert Cuypmarkt" },
      { time: "13:00", title: "Rijksmuseum", note: "Booked in advance", icon: "landmark", lat: 52.36, lng: 4.8852, place: "Rijksmuseum" },
      { time: "16:00", title: "Winkel 43", note: "Coffee + apple pie", icon: "utensils", lat: 52.3838, lng: 4.8853, place: "Winkel 43" },
      { time: "20:00", title: "Luxury Canal Cruise", note: "Unlimited cocktails/bubbles · €47.74 · Arrive 19:45 at the jetty, Oudezijds Voorburgwal 230 (near Dam Square)", icon: "landmark", lat: 52.3722, lng: 4.8958, place: "Oudezijds Voorburgwal 230" },
    ],
  },
  {
    label: "Wed 23",
    full: "Wednesday, 23 September",
    city: "Amsterdam → Brussels",
    stops: [
      { time: "11:00", title: "Dam Square", note: "Free, central wandering", icon: "landmark", lat: 52.3731, lng: 4.8926, place: "Dam Square" },
      { time: "13:00", title: "Nieuwmarkt", note: "Lunch on the square", icon: "utensils", lat: 52.3724, lng: 4.9004, place: "Nieuwmarkt" },
      { time: "21:10", title: "Eurostar to Brussels", note: "Amsterdam Centraal → Midi", icon: "trainFront", lat: 52.3791, lng: 4.9003, place: "Amsterdam Centraal" },
      { time: "23:23", title: "Arrive Brussel-Zuid", note: "Public transport (~27 min): IC to Brussel-Centraal (4 min) → walk 3 min → bus 63 to Gueux stop (12 min, 9 stops) → walk 1 min. Or Uber (~10-12 min, est. €15-20, check app for live price)", icon: "trainFront", lat: 50.8361, lng: 4.3358, place: "Brussel-Zuid" },
      { time: "23:50", title: "Check in — Hôtel Satellite", note: "Get off bus 63 at the Gueux stop, then 1 min walk to the hotel", icon: "mapPin", lat: 50.8466897, lng: 4.3907001, place: "Hôtel Satellite" },
    ],
  },
  {
    label: "Thu 24",
    full: "Thursday, 24 September",
    city: "Brussels",
    stops: [
      { time: "09:00", title: "Grand Place", note: "Quiet before the crowds", icon: "landmark", lat: 50.8467, lng: 4.3525, place: "Grand Place" },
      { time: "13:00", title: "Chez Léon", note: "Mussels & frites", icon: "utensils", lat: 50.8494, lng: 4.3521, place: "Chez Léon" },
      { time: "19:00", title: "Maison Dandoy", note: "Waffles & speculoos", icon: "croissant", lat: 50.8469, lng: 4.3505, place: "Maison Dandoy" },
    ],
  },
  {
    label: "Fri 25",
    full: "Friday, 25 September",
    city: "Brussels",
    stops: [
      { time: "09:30", title: "Sablon", note: "Antiques + pastries", icon: "croissant", lat: 50.8412, lng: 4.3557, place: "Place du Grand Sablon" },
      { time: "13:00", title: "Le Pain Quotidien", note: "Lunch near Sablon", icon: "utensils", lat: 50.8408, lng: 4.357, place: "Le Pain Quotidien" },
      { time: "17:00", title: "Head to station", note: "Return leg — tbc", icon: "trainFront", lat: 50.8357, lng: 4.3366, place: "Brussels-Midi" },
    ],
  },
];

function StatusBar({ light }) {
  const color = light ? "#fff" : palette.ink;
  return (
    <div className="flex items-center justify-between px-6 pt-3 text-xs font-medium" style={{ color }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>9:41</span>
      <div className="flex gap-1 items-center">
        <div className="w-3 h-2 rounded-sm" style={{ background: color }} />
        <div className="w-4 h-2 rounded-sm" style={{ background: color }} />
        <div className="w-5 h-2.5 rounded-sm border" style={{ borderColor: color }} />
      </div>
    </div>
  );
}

function BottomNav({ tab, setTab }) {
  const items = [
    { id: "home", icon: Home, label: "Home" },
    { id: "trip", icon: CalendarDays, label: "Trip" },
    { id: "map", icon: MapIcon, label: "Map" },
  ];
  return (
    <div
      className="absolute bottom-0 left-0 right-0 flex justify-around items-center py-3 border-t"
      style={{ background: "rgba(255,255,255,0.92)", borderColor: palette.paleSky, backdropFilter: "blur(6px)" }}
    >
      {items.map((it) => {
        const active = tab === it.id;
        const Icon = it.icon;
        return (
          <button
            key={it.id}
            onClick={() => setTab(it.id)}
            className="flex flex-col items-center gap-1 px-3"
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
              style={{ background: active ? palette.denim : "transparent" }}
            >
              <Icon size={17} color={active ? "#fff" : palette.slate} />
            </div>
            <span
              className="text-[10px] tracking-wide"
              style={{ color: active ? palette.denim : palette.slate, fontWeight: active ? 700 : 500 }}
            >
              {it.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function HomeScreen({ goTrip, onOpenDay }) {
  return (
    <div
      className="h-full overflow-y-auto pb-24"
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(0,15,34,0.6) 0%, rgba(0,15,34,0.25) 32%, #f5f9fd 60%), url(${IMG.brusselsHome})`,
        backgroundSize: "cover",
        backgroundPosition: "top center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <StatusBar light />
      <div className="flex items-center justify-between px-6 pt-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: palette.paleSky }}>Goedemorgen</p>
          <h1 className="text-2xl font-semibold text-white" style={{ fontFamily: "'Fraunces', serif" }}>
            21 days to go
          </h1>
        </div>
        <div className="w-10 h-10 rounded-full flex items-center justify-center relative" style={{ background: "rgba(255,255,255,0.25)", backdropFilter: "blur(6px)" }}>
          <Bell size={16} color="#fff" />
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] flex items-center justify-center text-white" style={{ background: palette.denim }}>2</span>
        </div>
      </div>

      <button onClick={goTrip} className="block w-full text-left px-6 mt-5">
        <div className="rounded-3xl overflow-hidden relative shadow-lg" style={{ height: 190 }}>
          <img src={IMG.hero} alt="Amsterdam & Brussels" className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(0,15,34,0) 20%, ${palette.ink} 100%)` }} />
          <div className="absolute bottom-4 left-5 right-5">
            <p className="text-[11px] tracking-[0.2em] uppercase" style={{ color: palette.paleSky }}>21 – 25 Sept</p>
            <h2 className="text-xl font-semibold text-white" style={{ fontFamily: "'Fraunces', serif" }}>Amsterdam & Brussels</h2>
            <p className="text-xs text-white/80 mt-0.5">Conference trip · with a friend</p>
          </div>
        </div>
      </button>

      <div className="px-6 mt-4 flex gap-2">
        {days.map((d, i) => (
          <button
            key={d.label}
            onClick={() => onOpenDay?.(i)}
            className="flex-1 rounded-xl py-2 text-center"
            style={{ background: i === 0 ? palette.denim : palette.paleSky }}
          >
            <p className="text-[10px] font-semibold" style={{ color: i === 0 ? "#fff" : palette.navy }}>
              {d.label.split(" ")[0]}
            </p>
            <p className="text-xs font-bold" style={{ color: i === 0 ? "#fff" : palette.navy }}>
              {d.label.split(" ")[1]}
            </p>
          </button>
        ))}
      </div>

      <p className="px-6 mt-6 text-[11px] uppercase tracking-[0.2em]" style={{ color: palette.slate }}>Stops</p>
      <div className="px-6 mt-2 flex flex-col gap-3">
        <button
          onClick={() => onOpenDay?.(0)}
          className="rounded-2xl overflow-hidden flex w-full text-left"
          style={{ background: "#fff", boxShadow: "0 4px 14px rgba(27,53,84,0.08)" }}
        >
          <img src={IMG.amsterdam} className="w-20 h-20 object-cover" alt="Amsterdam" />
          <div className="p-3 flex-1">
            <h3 className="font-semibold text-sm" style={{ color: palette.ink }}>Amsterdam</h3>
            <p className="text-xs" style={{ color: palette.slate }}>21 – 23 Sept · The Crown Hotel</p>
          </div>
        </button>
        <button
          onClick={() => onOpenDay?.(2)}
          className="rounded-2xl overflow-hidden flex w-full text-left"
          style={{ background: "#fff", boxShadow: "0 4px 14px rgba(27,53,84,0.08)" }}
        >
          <img src={IMG.brussels} className="w-20 h-20 object-cover" alt="Brussels" />
          <div className="p-3 flex-1">
            <h3 className="font-semibold text-sm" style={{ color: palette.ink }}>Brussels</h3>
            <p className="text-xs" style={{ color: palette.slate }}>23 – 25 Sept · Hotel Satellite</p>
          </div>
        </button>
      </div>

      <AttachmentsSection />
    </div>
  );
}

function AttachmentsSection() {
  const fileInputRef = useRef(null);
  const [files, setFiles] = useState(() => {
    try {
      const raw = localStorage.getItem(ATTACHMENTS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(ATTACHMENTS_STORAGE_KEY, JSON.stringify(files));
      setError("");
    } catch {
      setError("Couldn't save — try a smaller file.");
    }
  }, [files]);

  const handlePick = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    picked.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setFiles((prev) => [
          ...prev,
          { id: Date.now() + Math.random(), name: file.name, type: file.type, size: file.size, dataUrl: reader.result },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));

  return (
    <div className="mt-6">
      <div className="px-6 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: palette.slate }}>Attachments</p>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 text-xs font-semibold"
          style={{ color: palette.denim }}
        >
          <Plus size={13} /> Add
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          multiple
          hidden
          onChange={handlePick}
        />
      </div>

      {error && <p className="px-6 mt-1 text-xs" style={{ color: "#c0392b" }}>{error}</p>}

      {files.length === 0 ? (
        <p className="px-6 mt-2 text-xs" style={{ color: palette.slate }}>Save screenshots of bookings, tickets, or receipts here.</p>
      ) : (
        <div className="px-6 mt-2 flex gap-3 overflow-x-auto pb-1">
          {files.map((f) => (
            <div key={f.id} className="relative shrink-0" style={{ width: 76 }}>
              <button
                onClick={() => window.open(f.dataUrl, "_blank")}
                className="block w-full rounded-xl overflow-hidden"
                style={{ height: 76, background: "#fff", boxShadow: "0 3px 10px rgba(27,53,84,0.08)" }}
              >
                {f.type.startsWith("image/") ? (
                  <img src={f.dataUrl} alt={f.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <FileText size={22} color={palette.slate} />
                  </div>
                )}
              </button>
              <button
                onClick={() => removeFile(f.id)}
                aria-label={`Remove ${f.name}`}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: palette.ink }}
              >
                <X size={11} color="#fff" />
              </button>
              <p className="mt-1 text-[10px] truncate" style={{ color: palette.slate }}>{f.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function loadItinerary() {
  try {
    const raw = localStorage.getItem(ITINERARY_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through to defaults
  }
  return days;
}

const emptyForm = { time: "", title: "", note: "", icon: "landmark", lat: null, lng: null, place: "" };

function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function LocationSearch({ placeholder, onSelect, autoFocus, dropdownZIndex = 1000 }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounced = useDebouncedValue(query, 400);

  useEffect(() => {
    if (debounced.trim().length < 3) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(debounced)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const pick = (r) => {
    onSelect({
      name: r.display_name.split(",")[0],
      fullName: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    });
    setQuery("");
    setResults([]);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search size={13} color={palette.slate} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder || "Search for a place"}
          className="text-sm w-full pl-8 pr-3 py-2 rounded-lg border outline-none"
          style={{ borderColor: palette.paleSky, color: palette.ink, background: "#fff" }}
        />
        {loading && (
          <Loader2
            size={13}
            color={palette.slate}
            className="animate-spin"
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)" }}
          />
        )}
      </div>
      {results.length > 0 && (
        <div
          className="absolute left-0 right-0 mt-1 rounded-lg overflow-hidden"
          style={{ background: "#fff", boxShadow: "0 6px 20px rgba(27,53,84,0.25)", border: `1px solid ${palette.paleSky}`, zIndex: dropdownZIndex }}
        >
          {results.map((r) => (
            <button
              key={r.place_id}
              onClick={() => pick(r)}
              className="block w-full text-left px-3 py-2 text-xs"
              style={{ color: palette.ink, borderBottom: `1px solid ${palette.paleSky}` }}
            >
              {r.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StopForm({ form, setForm, onSave, onCancel }) {
  return (
    <div className="mt-1 rounded-xl p-3 flex flex-col gap-2" style={{ background: "#fff", boxShadow: "0 3px 10px rgba(27,53,84,0.07)", border: `1px solid ${palette.paleSky}` }}>
      <div className="flex gap-2">
        <input
          value={form.time}
          onChange={(e) => setForm({ ...form, time: e.target.value })}
          placeholder="HH:MM"
          className="text-xs px-2 py-1.5 rounded-lg border outline-none w-20"
          style={{ borderColor: palette.paleSky, color: palette.ink, fontFamily: "'JetBrains Mono', monospace" }}
        />
        <input
          autoFocus
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Title"
          className="text-sm px-2 py-1.5 rounded-lg border outline-none flex-1"
          style={{ borderColor: palette.paleSky, color: palette.ink }}
        />
      </div>
      <input
        value={form.note}
        onChange={(e) => setForm({ ...form, note: e.target.value })}
        placeholder="Note"
        className="text-xs px-2 py-1.5 rounded-lg border outline-none"
        style={{ borderColor: palette.paleSky, color: palette.ink }}
      />

      {form.lat != null ? (
        <div className="flex items-center justify-between rounded-lg px-2 py-1.5" style={{ background: palette.paleSky }}>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: palette.navy }}>
            <MapPin size={12} /> {form.place || `${form.lat.toFixed(4)}, ${form.lng.toFixed(4)}`}
          </div>
          <button onClick={() => setForm({ ...form, lat: null, lng: null, place: "" })} aria-label="Remove location">
            <X size={12} color={palette.navy} />
          </button>
        </div>
      ) : (
        <LocationSearch
          placeholder="Attach a location (optional)"
          onSelect={(r) => setForm({ ...form, lat: r.lat, lng: r.lng, place: r.name })}
        />
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {ICON_OPTIONS.map((opt) => {
            const OptIcon = opt.icon;
            const selected = form.icon === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setForm({ ...form, icon: opt.key })}
                aria-label={opt.label}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: selected ? palette.denim : palette.paleSky }}
              >
                <OptIcon size={13} color={selected ? "#fff" : palette.navy} />
              </button>
            );
          })}
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="text-xs font-medium" style={{ color: palette.slate }}>Cancel</button>
          <button onClick={onSave} className="text-xs font-semibold" style={{ color: palette.denim }} disabled={!form.title.trim()}>Save</button>
        </div>
      </div>
    </div>
  );
}

function TripScreen({ back, initialActive = 0 }) {
  const [itinerary, setItinerary] = useState(loadItinerary);
  const [active, setActive] = useState(initialActive);
  const [editingIndex, setEditingIndex] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    try {
      localStorage.setItem(ITINERARY_STORAGE_KEY, JSON.stringify(itinerary));
    } catch {
      // localStorage unavailable — edits just won't persist across reloads
    }
  }, [itinerary]);

  const day = itinerary[active];

  const changeDay = (i) => {
    setActive(i);
    setEditingIndex(null);
    setAdding(false);
  };

  const startEdit = (i) => {
    setForm({ ...emptyForm, ...day.stops[i] });
    setEditingIndex(i);
    setAdding(false);
  };

  const startAdd = () => {
    setForm(emptyForm);
    setAdding(true);
    setEditingIndex(null);
  };

  const cancelForm = () => {
    setEditingIndex(null);
    setAdding(false);
  };

  const saveForm = () => {
    if (!form.title.trim()) return;
    setItinerary((prev) =>
      prev.map((d, di) => {
        if (di !== active) return d;
        const stops = adding ? [...d.stops, { ...form, time: form.time || "00:00" }] : d.stops.map((s, si) => (si === editingIndex ? { ...form } : s));
        stops.sort((a, b) => a.time.localeCompare(b.time));
        return { ...d, stops };
      })
    );
    cancelForm();
  };

  const deleteStop = (i) => {
    setItinerary((prev) => prev.map((d, di) => (di === active ? { ...d, stops: d.stops.filter((_, si) => si !== i) } : d)));
    if (editingIndex === i) cancelForm();
  };

  return (
    <div
      className="h-full overflow-y-auto pb-24"
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(0,15,34,0.6) 0%, rgba(0,15,34,0.25) 26%, #f5f9fd 48%), url(${IMG.tripBg})`,
        backgroundSize: "cover",
        backgroundPosition: "top center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <StatusBar light />
      <div className="flex items-center gap-3 px-6 pt-4">
        <button onClick={back} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.25)", backdropFilter: "blur(6px)" }}>
          <ChevronLeft size={16} color="#fff" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-white" style={{ fontFamily: "'Fraunces', serif" }}>{day.city}</h1>
          <p className="text-xs" style={{ color: palette.paleSky }}>{day.full}</p>
        </div>
      </div>

      <div className="flex gap-2 px-6 mt-4 overflow-x-auto">
        {itinerary.map((d, i) => (
          <button
            key={d.label}
            onClick={() => changeDay(i)}
            className="rounded-full px-4 py-2 text-xs font-semibold whitespace-nowrap"
            style={{ background: i === active ? palette.denim : "#fff", color: i === active ? "#fff" : palette.navy, border: `1px solid ${i === active ? palette.denim : palette.paleSky}` }}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="px-6 mt-6 flex flex-col">
        {day.stops.map((s, i) => {
          const Icon = ICONS[s.icon] || MapPin;
          const isEditing = editingIndex === i;
          return (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: palette.navy }}>
                  <Icon size={15} color={palette.paleSky} />
                </div>
                {i < day.stops.length - 1 && (
                  <div className="flex-1 w-px my-1" style={{ background: `repeating-linear-gradient(${palette.steel} 0 4px, transparent 4px 8px)`, minHeight: 28 }} />
                )}
              </div>
              <div className="pb-6 flex-1">
                {isEditing ? (
                  <StopForm form={form} setForm={setForm} onSave={saveForm} onCancel={cancelForm} />
                ) : (
                  <>
                    <p className="text-[11px] font-bold tracking-wide" style={{ color: palette.denim, fontFamily: "'JetBrains Mono', monospace" }}>{s.time}</p>
                    <div className="mt-1 rounded-xl p-3 flex items-start justify-between gap-2" style={{ background: "#fff", boxShadow: "0 3px 10px rgba(27,53,84,0.07)" }}>
                      <div>
                        <h4 className="text-sm font-semibold" style={{ color: palette.ink }}>{s.title}</h4>
                        <p className="text-xs mt-0.5" style={{ color: palette.slate }}>{s.note}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => startEdit(i)} aria-label={`Edit ${s.title}`}>
                          <Pencil size={13} color={palette.slate} />
                        </button>
                        <button onClick={() => deleteStop(i)} aria-label={`Delete ${s.title}`}>
                          <Trash2 size={13} color={palette.slate} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {adding ? (
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: palette.steel }}>
                <Plus size={15} color="#fff" />
              </div>
            </div>
            <div className="pb-6 flex-1">
              <StopForm form={form} setForm={setForm} onSave={saveForm} onCancel={cancelForm} />
            </div>
          </div>
        ) : (
          <button
            onClick={startAdd}
            className="flex items-center justify-center gap-2 rounded-xl py-3 mt-1 text-xs font-semibold"
            style={{ border: `1px dashed ${palette.steel}`, color: palette.denim }}
          >
            <Plus size={14} /> Add a stop
          </button>
        )}
      </div>
    </div>
  );
}

const routeIcon = new L.DivIcon({
  className: "",
  html: `<div style="background:${palette.ink};color:#fff;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:600;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);transform:translate(-50%,-130%)">$LABEL</div><div style="width:10px;height:10px;border-radius:999px;background:${palette.denim};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);transform:translate(-50%,-50%)"></div>`,
  iconSize: [0, 0],
});

function routeMarkerIcon(name) {
  return new L.DivIcon({
    className: "",
    html: routeIcon.options.html.replace("$LABEL", name),
    iconSize: [0, 0],
  });
}

const pinIconCache = {};
function pinIconFor(category) {
  const key = category && PIN_CATEGORIES[category] ? category : "other";
  if (pinIconCache[key]) return pinIconCache[key];
  const cat = PIN_CATEGORIES[key];
  const iconSvg = categoryIconSvg(key);
  const icon = new L.DivIcon({
    className: "",
    html: `
      <div style="position:relative;width:30px;height:38px;transform:translate(-50%,-100%);">
        <div style="position:absolute;top:0;left:0;width:30px;height:30px;border-radius:50%;background:${cat.color};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
          ${iconSvg}
        </div>
        <div style="position:absolute;top:25px;left:9px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:9px solid ${cat.color};"></div>
      </div>
    `,
    iconSize: [0, 0],
  });
  pinIconCache[key] = icon;
  return icon;
}

function dayMarkerIcon(color) {
  return new L.DivIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:999px;background:${color};border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,0.4);transform:translate(-50%,-50%)"></div>`,
    iconSize: [0, 0],
  });
}

function ClickToAddPin({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng);
    },
  });
  return null;
}

function MapRefSetter({ mapRef }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
  }, [map]);
  return null;
}

function MapScreen({ onOpenDay }) {
  const [pins, setPins] = useState(() => {
    try {
      const raw = localStorage.getItem(PINS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : DEFAULT_PINS;
    } catch {
      return DEFAULT_PINS;
    }
  });
  const [itinerary] = useState(loadItinerary);
  const [draft, setDraft] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [draftCategory, setDraftCategory] = useState("other");
  const [showPins, setShowPins] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const mapRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify(pins));
    } catch {
      // localStorage unavailable — pins just won't persist across reloads
    }
  }, [pins]);

  const savePin = () => {
    if (!draft) return;
    setPins((p) => [...p, { id: Date.now(), lat: draft.lat, lng: draft.lng, name: draftName.trim() || "Untitled pin", category: draftCategory }]);
    setDraft(null);
    setDraftName("");
    setDraftCategory("other");
  };

  const removePin = (id) => setPins((p) => p.filter((pin) => pin.id !== id));

  const handleSearchSelect = (result) => {
    mapRef.current?.flyTo([result.lat, result.lng], 15);
    setDraft({ lat: result.lat, lng: result.lng });
    setDraftName(result.name);
    setDraftCategory("other");
    setSearchOpen(false);
  };

  return (
    <div className="h-full flex flex-col" style={{ background: "#f5f9fd" }}>
      <StatusBar />
      <div className="px-6 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: palette.ink, fontFamily: "'Fraunces', serif" }}>Route</h1>
            <p className="text-xs" style={{ color: palette.slate }}>{searchOpen ? "Search for a place to pin" : "Tap the map to drop a pin"}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Search for a place"
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: searchOpen ? palette.denim : palette.paleSky }}
            >
              <Search size={14} color={searchOpen ? "#fff" : palette.navy} />
            </button>
            <button
              onClick={() => setShowPins((v) => !v)}
              className="flex items-center gap-1 text-xs font-semibold rounded-full px-3 py-1.5"
              style={{ background: showPins ? palette.denim : palette.paleSky, color: showPins ? "#fff" : palette.navy }}
            >
              <MapPin size={14} />
              {pins.length}
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="mt-3" style={{ position: "relative", zIndex: 1000 }}>
            <LocationSearch placeholder="Search for a place..." onSelect={handleSearchSelect} autoFocus />
          </div>
        )}
      </div>

      <div className="flex-1 relative">
        <MapContainer center={[52.3676, 4.9041]} zoom={13} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapRefSetter mapRef={mapRef} />
          {routeStops.map((s) => (
            <Marker key={s.name} position={[s.lat, s.lng]} icon={routeMarkerIcon(s.name)} />
          ))}
          {itinerary.flatMap((d, di) =>
            d.stops
              .filter((s) => s.lat != null && s.lng != null)
              .map((s, si) => (
                <Marker key={`${di}-${si}`} position={[s.lat, s.lng]} icon={dayMarkerIcon(DAY_COLORS[di % DAY_COLORS.length])}>
                  <Popup>
                    <div className="flex flex-col gap-1" style={{ minWidth: 170 }}>
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: DAY_COLORS[di % DAY_COLORS.length] }}>
                        {d.label} · {s.time}
                      </span>
                      <span className="text-sm font-medium">{s.title}</span>
                      {s.note && <span className="text-xs" style={{ color: palette.slate }}>{s.note}</span>}
                      <button
                        onClick={() => onOpenDay?.(di)}
                        className="text-xs font-semibold text-left mt-1"
                        style={{ color: palette.denim }}
                      >
                        View in itinerary
                      </button>
                    </div>
                  </Popup>
                </Marker>
              ))
          )}
          {pins.map((p) => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIconFor(p.category)}>
              <Popup>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{p.name}</span>
                  {p.address && <span className="text-xs" style={{ color: palette.slate }}>{p.address}</span>}
                  <button
                    onClick={() => removePin(p.id)}
                    className="text-xs font-semibold text-left"
                    style={{ color: "#c0392b" }}
                  >
                    Remove
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
          {draft && <Marker position={[draft.lat, draft.lng]} icon={pinIconFor(draftCategory)} />}
          <ClickToAddPin onPick={(latlng) => { setDraft(latlng); setDraftName(""); setDraftCategory("other"); }} />
        </MapContainer>

        {draft && (
          <div className="absolute left-4 right-4 bottom-4 rounded-2xl p-3 flex flex-col gap-2" style={{ background: "#fff", boxShadow: "0 6px 20px rgba(27,53,84,0.25)", border: `1px solid ${palette.paleSky}`, zIndex: 1000 }}>
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && savePin()}
              placeholder="Name this place"
              className="text-sm px-3 py-2 rounded-lg border outline-none"
              style={{ borderColor: palette.paleSky, color: palette.ink }}
            />
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {PIN_CATEGORY_OPTIONS.map((opt) => {
                const OptIcon = opt.icon;
                const selected = draftCategory === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setDraftCategory(opt.key)}
                    aria-label={opt.label}
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: selected ? opt.color : palette.paleSky }}
                  >
                    <OptIcon size={13} color={selected ? "#fff" : palette.navy} />
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end gap-4">
              <button onClick={() => setDraft(null)} className="text-xs font-medium" style={{ color: palette.slate }}>Cancel</button>
              <button onClick={savePin} className="text-xs font-semibold" style={{ color: palette.denim }}>Save pin</button>
            </div>
          </div>
        )}

        {showPins && (
          <div
            className="absolute inset-0 flex items-end"
            style={{ background: "rgba(0,15,34,0.35)", zIndex: 1000 }}
            onClick={() => setShowPins(false)}
          >
            <div
              className="w-full rounded-t-3xl p-4 flex flex-col gap-2"
              style={{ background: "#fff", maxHeight: "80%", overflowY: "auto" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: palette.slate }}>Saved pins</p>
                <button onClick={() => setShowPins(false)} aria-label="Close">
                  <X size={16} color={palette.slate} />
                </button>
              </div>

              {pins.length === 0 ? (
                <p className="text-xs" style={{ color: palette.slate }}>No pins yet — tap anywhere on the map to save a place.</p>
              ) : (
                pins.map((p) => {
                  const cat = PIN_CATEGORIES[p.category] || PIN_CATEGORIES.other;
                  const CatIcon = cat.icon;
                  return (
                    <div
                      key={p.id}
                      className="flex items-start justify-between gap-2 rounded-xl px-3 py-2"
                      style={{ background: "#f5f9fd" }}
                    >
                      <div className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: cat.color, marginTop: 1 }}>
                          <CatIcon size={12} color="#fff" />
                        </div>
                        <div>
                          <p className="text-sm font-medium" style={{ color: palette.ink }}>{p.name}</p>
                          {p.address && <p className="text-xs mt-0.5" style={{ color: palette.slate }}>{p.address}</p>}
                        </div>
                      </div>
                      <button onClick={() => removePin(p.id)} aria-label={`Remove ${p.name}`} className="shrink-0">
                        <X size={14} color={palette.slate} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      <div className="h-24" />
    </div>
  );
}

export default function TravelAppPrototype() {
  const [tab, setTab] = useState("home");
  const [requestedDay, setRequestedDay] = useState(null);

  const goToTab = (id) => {
    setRequestedDay(null);
    setTab(id);
  };

  const openDayInItinerary = (dayIndex) => {
    setRequestedDay(dayIndex);
    setTab("trip");
  };

  return (
    <div className="w-full min-h-[820px] flex items-center justify-center" style={{ background: `radial-gradient(circle at 30% 20%, ${palette.slate}, ${palette.ink})`, fontFamily: "'Inter', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');`}</style>
      <div
        className="relative rounded-[2.5rem] overflow-hidden border-[6px]"
        style={{ width: 380, height: 780, borderColor: palette.ink, boxShadow: "0 30px 60px rgba(0,0,0,0.4)" }}
      >
        {tab === "home" && <HomeScreen goTrip={() => goToTab("trip")} onOpenDay={openDayInItinerary} />}
        {tab === "trip" && <TripScreen back={() => goToTab("home")} initialActive={requestedDay ?? 0} />}
        {tab === "map" && <MapScreen onOpenDay={openDayInItinerary} />}
        <BottomNav tab={tab} setTab={goToTab} />
      </div>
    </div>
  );
}
