import { boardAttributes } from "../lib/board-customization";
import type { tourBookingService } from "../lib/shopify/tour-booking";
type Availability = Awaited<
  ReturnType<ReturnType<typeof tourBookingService>["availability"]>
>;
type Board = Availability["addons"][number];
const root = document.querySelector<HTMLElement>("[data-tour-booking]");
if (root) initialize(root);
function initialize(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>("[data-booking-form]")!;
  const find = <T extends HTMLElement = HTMLElement>(selector: string) =>
    root.querySelector<T>(selector)!;
  const field = (name: string) =>
    form.elements.namedItem(name) as
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const status = find("[data-checkout-status]");
  const calendarStatus = find("[data-calendar-status]");
  const checkout = find<HTMLButtonElement>("[data-tour-checkout]");
  const storageKey = "aava-tour-booking-draft";
  let selectedDate = "";
  let month = "";
  let data: Availability | null = null;
  let board: Board | undefined;
  let controller: AbortController | undefined;
  let submitting = false;
  let saved: Record<string, unknown> = {};
  const money = (amount: string | number, currency = "USD") =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      Number(amount),
    );
  const pretty = (date: string) =>
    new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(date + "T12:00:00Z"));
  function readSelections() {
    const config = board?.customization;
    if (!config) return undefined;
    return {
      preference:
        form.querySelector<HTMLInputElement>(
          '[name="board-preference"]:checked',
        )?.value || "With meat",
      ...Object.fromEntries(
        ["cheeses", "meats", "accompaniments"].map((key) => [
          key,
          Array.from(
            form.querySelectorAll<HTMLInputElement>(
              `[name="board-${key}"]:checked`,
            ),
            (input) => input.value,
          ),
        ]),
      ),
    };
  }
  function values(): Record<string, unknown> {
    const values: Record<string, unknown> = Object.fromEntries(
      new FormData(form).entries(),
    );
    values.guests = Number(field("guests").value);
    values.boardQuantity = Number(field("boardQuantity").value);
    values.date = selectedDate;
    values.month = month;
    values.preferences = new FormData(form).getAll("preferences");
    for (const name of ["ageConfirmed", "termsAccepted", "damageAccepted"])
      values[name] = (field(name) as HTMLInputElement).checked;
    values.boardSelections = readSelections();
    return values;
  }
  function save() {
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ savedAt: Date.now(), values: values() }),
      );
    } catch {
      /* Booking works without browser storage. */
    }
    // Keep only non-personal selections in the URL, so a reload doesn't restore old query choices.
    const url = new URL('/booking', location.origin);
    for (const name of ['tourType', 'guests', 'snack']) url.searchParams.set(name, field(name).value);
    if (selectedDate) url.searchParams.set('date', selectedDate);
    history.replaceState(null, '', url);
  }
  try {
    const draft = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    if (
      draft &&
      Date.now() - draft.savedAt < 2 * 60 * 60 * 1000 &&
      draft.values &&
      typeof draft.values === "object"
    )
      saved = draft.values;
  } catch {
    /* Ignore an invalid or unavailable draft. */
  }
  const params = new URLSearchParams(location.search);
  const typeParam = params.get("tourType") || params.get("tour");
  const guestParam = params.get("guests") || params.get("a1");
  const snackParam = params.get("snack") || params.get("a2");
  if (typeParam) saved.tourType = typeParam.toLowerCase();
  if (guestParam) saved.guests = guestParam;
  if (snackParam) saved.snack = snackParam.toLowerCase();
  if (params.has("date")) saved.date = params.get("date");
  for (const key of [
    "name",
    "email",
    "phone",
    "pickup",
    "customPickup",
    "sandwich",
    "allergies",
    "requests",
    "boardQuantity",
  ]) {
    if (typeof saved[key] === "string" || typeof saved[key] === "number")
      field(key).value = String(saved[key]);
  }
  if (["public", "private"].includes(String(saved.tourType)))
    field("tourType").value = String(saved.tourType);
  if (Number(saved.guests) >= 1 && Number(saved.guests) <= 10)
    field("guests").value = String(saved.guests);
  if (["sandwich", "charcuterie", "none"].includes(String(saved.snack)))
    field("snack").value = String(saved.snack);
  for (const input of form.querySelectorAll<HTMLInputElement>(
    '[name="preferences"]',
  ))
    input.checked =
      Array.isArray(saved.preferences) &&
      saved.preferences.includes(input.value);
  for (const key of ["ageConfirmed", "termsAccepted", "damageAccepted"])
    (field(key) as HTMLInputElement).checked = saved[key] === true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(saved.date)))
    selectedDate = String(saved.date);
  if (/^\d{4}-\d{2}$/.test(String(saved.month))) month = String(saved.month);
  function currentVariant() {
    return board?.variants.find((v) => v.id === field("boardVariantId").value);
  }
  function summary() {
    const type = field("tourType").value,
      guests = Number(field("guests").value),
      snack = field("snack").value;
    const departure = data?.dates.find(
      (day) => day.date === selectedDate && day.available,
    );
    find("[data-summary-type]").textContent =
      type === "private" ? "Private whole bus" : "Public Tour";
    find("[data-summary-guests]").textContent =
      `${guests} ${guests === 1 ? "guest" : "guests"}`;
    find("[data-summary-date]").textContent = selectedDate
      ? pretty(selectedDate)
      : "Choose a date";
    find("[data-summary-snack]").textContent =
      snack === "sandwich"
        ? "Sandwich included"
        : snack === "none"
          ? "No snack"
          : board?.title || "Choose a catalog board";
    find("[data-summary-minimum]").hidden = type === "private";
    find("[data-tour-type-note]").textContent =
      type === "private"
        ? "One whole-bus booking reserves all 10 seats. The vehicle price is the same for 1–10 guests."
        : "Public tours require 4 total guests to operate. Smaller parties are welcome to book.";
    find("[data-tour-price-label]").textContent =
      type === "private"
        ? "Whole bus"
        : `Tour · ${guests} ${guests === 1 ? "seat" : "seats"}`;
    const tourTotal = departure
      ? Number(departure.price.amount) * (type === "private" ? 1 : guests)
      : null;
    const variant = currentVariant();
    const count = Number(field("boardQuantity").value);
    const boardTotal =
      snack === "charcuterie" && variant && count >= 1
        ? Number(variant.price.amount) * count
        : 0;
    find("[data-summary-board-line]").hidden = snack !== "charcuterie";
    find("[data-summary-board-price]").textContent = variant
      ? money(boardTotal, variant.price.currencyCode)
      : "Choose a board";
    find("[data-summary-tour-price]").textContent =
      tourTotal !== null
        ? money(tourTotal, departure!.price.currencyCode)
        : "—";
    find("[data-summary-total]").textContent =
      tourTotal !== null && (snack !== "charcuterie" || !!variant)
        ? money(tourTotal + boardTotal, departure!.price.currencyCode)
        : "—";
    find("[data-summary-capacity]").textContent = departure
      ? type === "private"
        ? "The whole bus is currently available."
        : `${departure.remaining} ${departure.remaining === 1 ? "seat" : "seats"} currently available.`
      : "Select a date to see availability.";
    checkout.disabled =
      submitting || !departure || (snack === "charcuterie" && !variant);
  }
  function calendar() {
    if (!data || !month) return;
    const [year, monthNumber] = month.split("-").map(Number);
    find("[data-calendar-month]").textContent = new Intl.DateTimeFormat(
      "en-US",
      { month: "long", year: "numeric", timeZone: "UTC" },
    ).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
    find<HTMLButtonElement>("[data-previous-month]").disabled =
      month <= data.minimumDate.slice(0, 7);
    find<HTMLButtonElement>("[data-next-month]").disabled =
      month >= data.maximumDate.slice(0, 7);
    const tbody = find("[data-calendar-days]");
    tbody.replaceChildren();
    const first = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
    const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const lookup = new Map(data.dates.map((day) => [day.date, day]));
    let row = document.createElement("tr");
    for (let slot = 0; slot < Math.ceil((first + days) / 7) * 7; slot++) {
      if (slot > 0 && slot % 7 === 0) {
        tbody.append(row);
        row = document.createElement("tr");
      }
      const cell = document.createElement("td");
      const number = slot - first + 1;
      if (number >= 1 && number <= days) {
        const date = `${month}-${String(number).padStart(2, "0")}`;
        const info = lookup.get(date);
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = String(number);
        button.dataset.date = date;
        button.disabled = !info?.available;
        button.setAttribute("aria-pressed", String(selectedDate === date));
        const capacity =
          field("tourType").value === "private"
            ? "whole bus available"
            : `${info?.remaining ?? 0} seats available`;
        button.setAttribute(
          "aria-label",
          `${pretty(date)} — ${info?.available ? capacity : "unavailable"}`,
        );
        if (info?.available)
          button.title =
            money(info.price.amount, info.price.currencyCode) +
            (field("tourType").value === "public"
              ? " per guest"
              : " for the whole bus");
        button.addEventListener("click", () => {
          selectedDate = date;
          calendar();
          summary();
          save();
          status.textContent = "";
          calendarStatus.textContent = `Selected ${pretty(date)}.`;
        });
        cell.append(button);
      }
      row.append(cell);
    }
    tbody.append(row);
  }
  function customizer() {
    const container = find("[data-tour-board-customizer]");
    container.replaceChildren();
    const config = board?.customization;
    if (!config) return;
    const h = document.createElement("h3");
    h.textContent = "Make it your own";
    container.append(h);
    const preference = document.createElement("fieldset");
    preference.className = "tour-preferences";
    const legend = document.createElement("legend");
    legend.textContent = "Include meat?";
    preference.append(legend);
    const previous =
      typeof saved.boardSelections === "object" && saved.boardSelections
        ? (saved.boardSelections as Record<string, unknown>)
        : {};
    for (const value of ["With meat", "No meat"]) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "board-preference";
      input.value = value;
      input.checked = value === (previous.preference || "With meat");
      label.append(input, document.createTextNode(value));
      preference.append(label);
    }
    container.append(preference);
    for (const key of ["cheeses", "meats", "accompaniments"] as const) {
      const group = document.createElement("fieldset");
      group.className = "tour-board-ingredients";
      group.dataset.group = key;
      const heading = document.createElement("legend");
      heading.textContent = key[0].toUpperCase() + key.slice(1);
      group.append(heading);
      const hint = document.createElement("p");
      hint.className = "form-help";
      hint.dataset.ingredientCount = key;
      group.append(hint);
      const details = document.createElement("details");
      details.open = key !== "accompaniments";
      const summary = document.createElement("summary");
      summary.textContent = `Choose ${key}`;
      details.append(summary);
      const options = document.createElement("div");
      options.className = "tour-ingredient-grid";
      for (const value of config[key]) {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.name = `board-${key}`;
        input.value = value;
        input.checked =
          Array.isArray(previous[key]) &&
          (previous[key] as string[]).includes(value);
        label.append(input, document.createTextNode(value));
        options.append(label);
      }
      details.append(options);
      group.append(details);
      container.append(group);
    }
    counts();
  }
  function counts() {
    const config = board?.customization;
    if (!config) return;
    const noMeat =
      form.querySelector<HTMLInputElement>('[name="board-preference"]:checked')
        ?.value === "No meat";
    for (const key of ["cheeses", "meats", "accompaniments"] as const) {
      const group = root.querySelector<HTMLFieldSetElement>(
        `[data-group="${key}"]`,
      )!;
      group.hidden = key === "meats" && noMeat;
      for (const input of group.querySelectorAll<HTMLInputElement>("input")) {
        input.disabled = group.hidden;
        if (group.hidden) input.checked = false;
      }
      const max =
        key === "cheeses"
          ? noMeat
            ? config.maxVegetarianCheeses
            : config.maxCheeses
          : key === "meats"
            ? config.maxMeats
            : config.maxAccompaniments;
      const count = group.querySelectorAll("input:checked").length;
      const hint = group.querySelector("[data-ingredient-count]")!;
      hint.textContent = `Choose 1–${max}. ${count} selected.${count > max ? " Remove extra selections." : ""}`;
      hint.classList.toggle("selection-limit-exceeded", count > max);
    }
  }
  function boardDetails(preferredVariant?: string) {
    board = data?.addons.find((b) => b.handle === field("boardHandle").value);
    const variants = field("boardVariantId") as HTMLSelectElement;
    variants.replaceChildren();
    if (board) {
      for (const variant of board.variants) {
        const option = document.createElement("option");
        option.value = variant.id;
        option.textContent = `${variant.title === "Default Title" ? "Standard board" : variant.title} — ${money(variant.price.amount, variant.price.currencyCode)}`;
        variants.append(option);
      }
      if (
        preferredVariant &&
        board.variants.some((v) => v.id === preferredVariant)
      )
        variants.value = preferredVariant;
      find("[data-board-title]").textContent = board.title;
      const image = find<HTMLImageElement>("[data-board-image]");
      image.hidden = !board.image;
      if (board.image) image.src = board.image;
      image.alt = board.title;
      find<HTMLAnchorElement>("[data-board-link]").href =
        `/charcuterie-menu/p/${encodeURIComponent(board.handle)}`;
    } else {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Choose a board first";
      variants.append(option);
    }
    find("[data-board-detail]").hidden = !board;
    customizer();
    snackVisibility();
    summary();
  }
  function populateBoards() {
    const select = field("boardHandle") as HTMLSelectElement;
    const current = select.value;
    const variantId =
      field("boardVariantId").value || String(saved.boardVariantId || "");
    select.replaceChildren();
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = data?.addons.length
      ? "Choose a charcuterie board"
      : "Catalog boards are currently unavailable";
    select.append(blank);
    for (const product of data?.addons || []) {
      const option = document.createElement("option");
      option.value = product.handle;
      option.textContent = product.title;
      select.append(option);
    }
    const selected = data?.addons.find(
      (b) => b.handle === current || b.variants.some((v) => v.id === variantId),
    );
    if (selected) select.value = selected.handle;
    boardDetails(variantId);
  }
  function snackVisibility() {
    const snack = field("snack").value;
    find("[data-sandwich-field]").hidden = snack !== "sandwich";
    field("sandwich").required = snack === "sandwich";
    field("sandwich").disabled = snack !== "sandwich";
    const picker = find("[data-board-picker]");
    picker.hidden = snack !== "charcuterie";
    for (const name of ["boardHandle", "boardVariantId", "boardQuantity"]) {
      field(name).disabled = snack !== "charcuterie";
      field(name).required = snack === "charcuterie";
    }
    for (const input of picker.querySelectorAll<HTMLInputElement>(
      'input[name^="board-"]',
    ))
      input.disabled =
        snack !== "charcuterie" ||
        !!input.closest<HTMLElement>("[data-group]")?.hidden;
  }
  function pickupVisibility() {
    const publicTour = field("tourType").value === "public";
    const option = (
      field("pickup") as HTMLSelectElement
    ).querySelector<HTMLOptionElement>(
      'option[value="Custom pickup (private tours)"]',
    );
    if (option) option.disabled = publicTour;
    if (publicTour && field("pickup").value === "Custom pickup (private tours)")
      field("pickup").value = "";
    const custom =
      field("pickup").value === "Custom pickup (private tours)" && !publicTour;
    find("[data-custom-pickup-field]").hidden = !custom;
    field("customPickup").required = custom;
    field("customPickup").disabled = !custom;
  }
  async function refresh() {
    // Retain ingredients while refreshing capacity or changing party size.
    if (board?.customization) saved.boardSelections = readSelections();
    controller?.abort();
    const request = new AbortController();
    controller = request;
    data = null;
    summary();
    checkout.disabled = true;
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      "[data-calendar] button",
    ))
      button.disabled = true;
    find("[data-calendar]").setAttribute("aria-busy", "true");
    calendarStatus.textContent = "Checking live availability…";
    try {
      const query = new URLSearchParams({
        type: field("tourType").value,
        guests: field("guests").value,
      });
      const response = await fetch(`/api/tours/availability?${query}`, {
        signal: request.signal,
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "Unable to load availability. Please try again.",
        );
      if (request.signal.aborted) return;
      data = result as Availability;
      if (
        !month ||
        month < data.minimumDate.slice(0, 7) ||
        month > data.maximumDate.slice(0, 7)
      )
        month = data.minimumDate.slice(0, 7);
      let changed = false;
      if (
        selectedDate &&
        !data.dates.some((day) => day.date === selectedDate && day.available)
      ) {
        selectedDate = "";
        changed = true;
      }
      find("[data-booking-window]").textContent =
        `Book at least ${data.minimumDays} days ahead, up to ${data.monthsAhead} months in advance. Dates use Eastern Time.`;
      populateBoards();
      calendar();
      summary();
      save();
      calendarStatus.textContent = !data.enabled
        ? "Online tour bookings are temporarily paused. Please contact us."
        : changed
          ? "Your previous date no longer has availability for this selection. Please choose another date."
          : "Choose an available date. Availability is confirmed again before checkout.";
    } catch (error) {
      if (request.signal.aborted) return;
      data = null;
      checkout.disabled = true;
      calendarStatus.textContent =
        error instanceof Error
          ? error.message
          : "Unable to load dates. Please try again.";
    } finally {
      if (!request.signal.aborted)
        find("[data-calendar]").setAttribute("aria-busy", "false");
    }
  }
  for (const [selector, delta] of [
    ["[data-previous-month]", -1],
    ["[data-next-month]", 1],
  ] as const) {
    find(selector).addEventListener("click", () => {
      const [year, m] = month.split("-").map(Number);
      month = new Date(Date.UTC(year, m - 1 + delta, 1, 12))
        .toISOString()
        .slice(0, 7);
      calendar();
      save();
      const available = data?.dates.some(
        (day) => day.date.startsWith(month) && day.available,
      );
      calendarStatus.textContent = available
        ? "Choose an available date."
        : "No dates are available this month for this selection. Try another month or tour type.";
    });
  }
  find("[data-refresh-availability]").addEventListener("click", refresh);
  field("boardHandle").addEventListener("change", () => {
    saved.boardSelections = {};
    boardDetails();
  });
  form.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement;
    if (target.name === "tourType" || target.name === "guests") {
      pickupVisibility();
      void refresh();
    }
    if (target.name === "snack") snackVisibility();
    if (target.name === "pickup") pickupVisibility();
    if (target.name.startsWith("board-")) counts();
    summary();
    save();
  });
  form.addEventListener("input", () => {
    summary();
    save();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    status.textContent = "";
    if (
      !data ||
      !selectedDate ||
      !data.dates.some((day) => day.date === selectedDate && day.available)
    ) {
      status.textContent = "Choose an available date before checkout.";
      find("[data-calendar-month]").focus();
      return;
    }
    try {
      if (field("snack").value === "charcuterie")
        boardAttributes(board!.handle, readSelections());
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "Complete your board choices.";
      find("[data-tour-board-customizer]").scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
      return;
    }
    if (!form.reportValidity()) return;
    submitting = true;
    summary();
    checkout.textContent = "Preparing secure checkout…";
    save();
    try {
      const response = await fetch("/api/tours/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values()),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "Unable to prepare checkout. Please try again.",
        );
      const url = new URL(result.checkoutUrl);
      if (url.protocol !== "https:")
        throw new Error("Secure checkout is temporarily unavailable.");
      window.location.assign(url.toString());
    } catch (error) {
      status.textContent =
        error instanceof Error
          ? error.message
          : "Unable to prepare checkout. Please try again.";
      if (
        /availability|enough seats|no longer available/.test(status.textContent)
      )
        await refresh();
    } finally {
      submitting = false;
      checkout.textContent = "Continue to secure checkout";
      summary();
    }
  });
  snackVisibility();
  pickupVisibility();
  summary();
  window.addEventListener('pageshow', event => { if (event.persisted) void refresh(); });
  void refresh();
}
