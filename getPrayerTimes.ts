import cheerio from "cheerio";

const BASE_URL = "https://example.com/prayer-times"; //placeholder link

export async function getPrayerTimes(fetchNextMonth = false) {
  const url = fetchNextMonth ? `${BASE_URL}&action=next` : BASE_URL;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let response: Response;

  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err: any) {
    clearTimeout(timeout);
    throw new Error(`Failed to fetch prayer times: ${err.message}`);
  }

  clearTimeout(timeout);

  const html = await response.text();
  const $ = cheerio.load(html);

  const clean = (text: string) => text.replace(/\s+/g, " ").trim();
  const splitTimes = (text: string) =>
    text.split("|").map((t) => t.trim());

  const hijriMonths = [
    "Muharram", "Safar", "Rabi al-Awwal", "Rabi al-Thani",
    "Jumada al-Awwal", "Jumada al-Thani", "Rajab", "Sha’ban",
    "Ramadan", "Shawwal", "Dhul-Qadah", "Dhul-Hijjah",
  ];

  const hijriMonthPattern = new RegExp(`(${hijriMonths.join("|")})`, "i");

  // Extract header info
  const headerRow = $("table tr").eq(1).text();
  const headerParts = clean(headerRow).split(" ");

  const gregorianMonth = headerParts[0];
  const hijriMonthMatch = headerParts.find((part) =>
    hijriMonths.some((hm) => hm.toLowerCase() === part.toLowerCase())
  );

  if (!gregorianMonth || !hijriMonthMatch) {
    throw new Error("Could not determine month from header");
  }

  const monthNumber = new Date(`${gregorianMonth} 1`).getMonth() + 1;
  const currentMonth = new Date().getMonth() + 1;
  let year = new Date().getFullYear();

  if (monthNumber < currentMonth) year += 1;

  let currentHijriMonth = hijriMonths.find(
    (hm) => hm.toLowerCase() === hijriMonthMatch.toLowerCase()
  );

  // Extract Jumu'ah times
  let jumuahTimes: [string | null, string | null] = [null, null];
  const pageText = $.text();

  const match = pageText.match(
    /JUMU'AH\s+(\d{1,2}:\d{2}\s*[AP]M)(?:\s+(\d{1,2}:\d{2}\s*[AP]M))?/i
  );

  if (match) {
    jumuahTimes = [match[1], match[2] || null];
  }

  const data: any[] = [];

  $("table tr").each((index, element) => {
    if (index <= 1) return;

    const columns = $(element).find("td");
    if (columns.length < 8) return;

    const [dayPartRaw, weekdayRaw] = clean($(columns[0]).text()).split(",");

    const hijriCol = clean($(columns[1]).text());

    let hijriDay: string | null = null;

    if (/^\d+$/.test(hijriCol)) {
      hijriDay = hijriCol;
    } else if (hijriMonthPattern.test(hijriCol)) {
      currentHijriMonth = hijriCol;
      hijriDay = "1";
    }

    const parsePrayer = (colIndex: number) => {
      const [time, iqama] = splitTimes($(columns[colIndex]).text());
      return { time: time || "", iqama: iqama || "" };
    };

    data.push({
      date: `${gregorianMonth} ${dayPartRaw.trim()}, ${year}`,
      weekday: weekdayRaw.trim(),
      hijri: `${currentHijriMonth} ${hijriDay}`,
      fajr: parsePrayer(2),
      sunrise: clean($(columns[3]).text()),
      dhuhr: parsePrayer(4),
      asr: parsePrayer(5),
      maghrib: parsePrayer(6),
      isha: parsePrayer(7),
      jumuah: jumuahTimes,
    });
  });

  if (data.length === 0) {
    throw new Error("No prayer times found. Structure may have changed.");
  }

  return data;
}
