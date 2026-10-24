// Configure Supabase in js/config.js before using this file.
(() => {
  "use strict";

  const form = document.getElementById("meal-search-form");
  const results = document.getElementById("meal-results");
  const statusEl = document.getElementById("meal-status");
  const countEl = document.getElementById("result-count");
  const locationStatus = document.getElementById("location-status");
  const locationButton = document.getElementById("use-location");

  let customerLocation = null;
  let searchRequestId = 0;

  document.getElementById("year").textContent = new Date().getFullYear();

  function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", isError);
  }

  function distanceKm(lat1, lon1, lat2, lon2) {
    const radians = degrees => degrees * Math.PI / 180;
    const dLat = radians(lat2 - lat1);
    const dLon = radians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(radians(lat1)) * Math.cos(radians(lat2))
      * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function makeTextElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text ?? "";
    return element;
  }

  function safeImageUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(value, window.location.href);
      if (url.protocol !== "https:" && url.origin !== window.location.origin) {
        return null;
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function renderMeals(meals) {
    results.replaceChildren();
    countEl.textContent = `${meals.length} ${meals.length === 1 ? "meal" : "meals"}`;

    if (meals.length === 0) {
      const empty = makeTextElement(
        "div",
        "empty-state",
        "No matching meals found. Try increasing your budget or changing your filters."
      );
      results.appendChild(empty);
      setStatus("No meals match your search.");
      return;
    }

    for (const meal of meals) {
      const card = makeTextElement("article", "meal-card", "");
      const imageUrl = safeImageUrl(meal.image_url);

      if (imageUrl) {
        const image = document.createElement("img");
        image.className = "meal-photo";
        image.src = imageUrl;
        image.alt = meal.name ? `${meal.name} meal` : "Homemade meal";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        image.addEventListener("error", () => image.remove(), { once: true });
        card.appendChild(image);
      } else {
        card.appendChild(makeTextElement("div", "meal-photo-placeholder", "🍲"));
      }

      const content = makeTextElement("div", "meal-content", "");
      const titleRow = makeTextElement("div", "meal-title-row", "");
      titleRow.appendChild(makeTextElement("h3", "", meal.name || "Homemade meal"));

      const price = Number(meal.price);
      titleRow.appendChild(makeTextElement(
        "span", "price",
        Number.isFinite(price) ? `₹${price.toFixed(0)}` : "Price unavailable"
      ));
      content.appendChild(titleRow);

      if (meal.description) {
        content.appendChild(makeTextElement("p", "meal-description", meal.description));
      }

      const chef = Array.isArray(meal.chef_profiles)
        ? meal.chef_profiles[0]
        : meal.chef_profiles;

      content.appendChild(makeTextElement(
        "p", "chef-line", `Home chef: ${chef?.kitchen_name || "Local home chef"}`
      ));

      const badges = makeTextElement("div", "", "");
      badges.appendChild(makeTextElement("span", "pill", (meal.food_type || "").replace("_", " ")));
      badges.appendChild(makeTextElement("span", "pill", meal.meal_type || "meal"));
      content.appendChild(badges);

      if (Number.isFinite(meal.distance_km)) {
        content.appendChild(makeTextElement(
          "p", "distance-line", `${meal.distance_km.toFixed(1)} km away`
        ));
      }

      card.appendChild(content);
      results.appendChild(card);
    }

    setStatus("Meals loaded successfully.");
  }

  async function searchMeals() {
    if (!window.supabase || !window.BHOJ_CONFIG) {
      setStatus("Setup incomplete: check the Supabase library and js/config.js.", true);
      return;
    }

    const requestId = ++searchRequestId;
    setStatus("Searching meals…");
    results.replaceChildren();
    countEl.textContent = "";

    const query = document.getElementById("meal-query").value.trim();
    const priceRaw = document.getElementById("max-price").value.trim();
    const maxPrice = priceRaw === "" ? null : Number(priceRaw);
    const foodType = document.getElementById("food-type").value;
    const mealType = document.getElementById("meal-type").value;
    const distanceRaw = document.getElementById("max-distance").value;
    const maxDistance = distanceRaw === "" ? null : Number(distanceRaw);

    if (maxPrice !== null && (!Number.isFinite(maxPrice) || maxPrice < 0)) {
      setStatus("Please enter a valid maximum price.", true);
      return;
    }

    if (maxDistance !== null && !customerLocation) {
      setStatus("Click “Use my location” before filtering by distance.", true);
      return;
    }

    // This query expects the SQL schema in supabase/schema.sql.
    let request = window.bhojSupabase
      .from("meals")
      .select(`
        id, name, description, price, food_type, meal_type,
        image_url, chef_id,
        chef_profiles!meals_chef_id_fkey (
          kitchen_name, latitude, longitude
        )
      `)
      .eq("is_available", true)
      .order("price", { ascending: true })
      .limit(100);

    if (query) request = request.ilike("name", `%${query.replace(/[%_,]/g, "")}%`);
    if (maxPrice !== null) request = request.lte("price", maxPrice);
    if (foodType) request = request.eq("food_type", foodType);
    if (mealType) request = request.eq("meal_type", mealType);

    const { data, error } = await request;

    if (requestId !== searchRequestId) return;

    if (error) {
      console.error("Supabase meal search error:", error);
      setStatus(
        `Could not load meals: ${error.message}. Check the table names, foreign key and RLS policies.`,
        true
      );
      return;
    }

    let meals = (data || []).map(meal => {
      const chef = Array.isArray(meal.chef_profiles)
        ? meal.chef_profiles[0]
        : meal.chef_profiles;

      if (customerLocation && chef &&
          chef.latitude !== null && chef.latitude !== undefined &&
          chef.longitude !== null && chef.longitude !== undefined) {
        return {
          ...meal,
          distance_km: distanceKm(
            customerLocation.latitude,
            customerLocation.longitude,
            Number(chef.latitude),
            Number(chef.longitude)
          )
        };
      }
      return meal;
    });

    if (customerLocation && maxDistance !== null) {
      meals = meals.filter(meal =>
        Number.isFinite(meal.distance_km) && meal.distance_km <= maxDistance
      );
    }

    // Keep distance sorting stable and predictable when location is known.
    if (customerLocation) {
      meals.sort((a, b) => {
        const da = Number.isFinite(a.distance_km) ? a.distance_km : Infinity;
        const db = Number.isFinite(b.distance_km) ? b.distance_km : Infinity;
        return da - db || Number(a.price) - Number(b.price);
      });
    }

    if (requestId === searchRequestId) renderMeals(meals);
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    searchMeals();
  });

  form.addEventListener("reset", () => {
    customerLocation = null;
    locationStatus.textContent = "";
    // Wait until browser resets the form controls.
    window.setTimeout(searchMeals, 0);
  });

  locationButton.addEventListener("click", () => {
    if (!navigator.geolocation) {
      locationStatus.textContent = "This browser does not support location access.";
      return;
    }

    locationStatus.textContent = "Waiting for location permission…";
    navigator.geolocation.getCurrentPosition(
      position => {
        customerLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        locationStatus.textContent = "Location selected. Search again to apply distance filters.";
        searchMeals();
      },
      error => {
        const message = error.code === 1
          ? "Location permission was denied. Allow it in browser settings to use distance filters."
          : "Could not get your location. Check device location settings and try again.";
        locationStatus.textContent = message;
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
    );
  });

  // Initial load.
  searchMeals();
})();
