import './style.css';

let currentLat = 50.00;
let currentLon = 36.23;
let locationName = 'Харків (за замовчуванням)';

const els = {
  score: document.getElementById('score'),
  statusText: document.getElementById('status-text'),
  location: document.getElementById('location'),
  geoBtn: document.getElementById('geo-btn'),
  breakdown: document.getElementById('breakdown-container'),
  symptoms: document.getElementById('symptoms-container'),
  forecast: document.getElementById('forecast-container'),
  root: document.documentElement
};

async function fetchWeatherData(lat, lon) {
  // past_days=3 for history (to calculate delayed effects), forecast_days=3 for forecast
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,surface_pressure,wind_speed_10m&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,surface_pressure,wind_speed_10m&past_days=3&forecast_days=3&timezone=auto`;
  const res = await fetch(url);
  return await res.json();
}

async function fetchAirQuality(lat, lon) {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi&timezone=auto`;
  const res = await fetch(url);
  return await res.json();
}

async function fetchKpForecast() {
  try {
    const url = `https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json`;
    const res = await fetch(url);
    const data = await res.json();
    return data; // Array of objects
  } catch (e) {
    console.error("Failed to fetch Kp forecast", e);
    return [];
  }
}

// Extract Kp for a specific JS Date
function getKpForDate(kpArray, targetDate) {
  if (!kpArray || kpArray.length === 0) return 2; // default
  
  // Find the closest time_tag
  let closest = kpArray[0];
  let minDiff = Infinity;
  const targetTime = targetDate.getTime();
  
  for (const item of kpArray) {
    const itemTime = new Date(item.time_tag + 'Z').getTime(); // NOAA time is UTC
    const diff = Math.abs(itemTime - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      closest = item;
    }
  }
  return parseFloat(closest.kp);
}

function getDistanceToRange(val, min, max) {
  if (val < min) return min - val;
  if (val > max) return val - max;
  return 0;
}

function getTrend(current, previous, idealMin, idealMax) {
  if (current === previous || previous === null || previous === undefined) {
    return { arrow: '▶', class: 'trend-neutral', color: 'var(--text-muted)' };
  }
  
  const isRising = current > previous;
  const arrow = isRising ? '▲' : '▼';
  
  const distCurrent = getDistanceToRange(current, idealMin, idealMax);
  const distPrev = getDistanceToRange(previous, idealMin, idealMax);
  
  if (distCurrent < distPrev) {
    return { arrow, class: 'trend-good', color: '#10b981' };
  } else if (distCurrent > distPrev) {
    return { arrow, class: 'trend-bad', color: '#ef4444' };
  } else {
    return { arrow: isRising ? '▲' : '▼', class: 'trend-neutral', color: 'var(--text-muted)' };
  }
}

function getMoonPhase(date) {
  // Known new moon: Jan 11, 2024 11:57 UTC
  const newMoon = new Date('2024-01-11T11:57:00Z').getTime();
  const lunarCycle = 29.53058867 * 24 * 60 * 60 * 1000;
  
  const diff = date.getTime() - newMoon;
  let phase = (diff % lunarCycle) / lunarCycle;
  if (phase < 0) phase += 1;
  
  // Return phase type and icon
  if (phase < 0.03 || phase > 0.97) return { name: 'Новомісяччя', icon: '🌑', type: 'new' };
  if (phase < 0.22) return { name: 'Молодий місяць', icon: '🌒', type: 'waxing_crescent' };
  if (phase < 0.28) return { name: 'Перша чверть', icon: '🌓', type: 'first_quarter' };
  if (phase < 0.47) return { name: 'Місяць прибуває', icon: '🌔', type: 'waxing_gibbous' };
  if (phase < 0.53) return { name: 'Повня', icon: '🌕', type: 'full' };
  if (phase < 0.72) return { name: 'Місяць щербатий', icon: '🌖', type: 'waning_gibbous' };
  if (phase < 0.78) return { name: 'Остання чверть', icon: '🌗', type: 'last_quarter' };
  return { name: 'Старий місяць', icon: '🌘', type: 'waning_crescent' };
}

function calculateScoreAndBreakdown(temp, apparentTemp, humidity, pressure, wind, aqi, kp, hourlyData, currentIndex, dateObj) {
  let score = 100;
  let breakdown = [];
  let symptoms = [];

  const moon = getMoonPhase(dateObj || new Date());

  // TEMPERATURE (Apparent)
  let pTemp = 0;
  let textTemp = `Відчувається як: Норма (${apparentTemp.toFixed(1)}°C)`;
  if (apparentTemp > 24) {
    pTemp = Math.round(Math.pow(apparentTemp - 24, 1.4) * 1.5);
    if (pTemp > 0) textTemp = `Спекотно (${apparentTemp.toFixed(1)}°C)`;
  } else if (apparentTemp < 18) {
    pTemp = Math.round(Math.pow(18 - apparentTemp, 1.3) * 1.2);
    if (pTemp > 0) textTemp = `Прохолодно (${apparentTemp.toFixed(1)}°C)`;
  }
  score -= pTemp;
  breakdown.push({ text: textTemp, value: -pTemp });

  // HUMIDITY
  let pHum = 0;
  let textHum = `Вологість: Норма (${humidity}%)`;
  if (humidity > 60) {
    pHum = Math.round(Math.pow(humidity - 60, 1.2) * 0.4);
    if (pHum > 0) textHum = `Вогко (${humidity}%)`;
  } else if (humidity < 30) {
    pHum = Math.round(Math.pow(30 - humidity, 1.2) * 0.4);
    if (pHum > 0) textHum = `Сухе повітря (${humidity}%)`;
  }
  score -= pHum;
  breakdown.push({ text: textHum, value: -pHum });

  // PRESSURE
  let pPress = 0;
  let textPress = `Тиск: Норма (${Math.round(pressure)} гПа)`;
  if (pressure < 1000) {
    pPress = Math.round(Math.pow(1000 - pressure, 1.2) * 1.5);
    if (pPress > 0) textPress = `Низький тиск (${Math.round(pressure)} гПа)`;
  } else if (pressure > 1020) {
    pPress = Math.round(Math.pow(pressure - 1020, 1.2) * 1.5);
    if (pPress > 0) textPress = `Високий тиск (${Math.round(pressure)} гПа)`;
  }
  score -= pPress;
  breakdown.push({ text: textPress, value: -pPress });

  // AQI
  let pAqi = 0;
  let textAqi = `Якість повітря: Норма (AQI ${Math.round(aqi)})`;
  if (aqi > 20) {
    pAqi = Math.round(Math.pow(aqi - 20, 1.1) * 0.4);
    if (pAqi > 0) textAqi = `Забруднення (AQI ${Math.round(aqi)})`;
  }
  score -= pAqi;
  breakdown.push({ text: textAqi, value: -pAqi });

  // KP
  let pKp = 0;
  let textKp = `Магнітний фон: Норма (Kp ${kp.toFixed(1)})`;
  if (kp > 3) {
    pKp = Math.round(Math.pow(kp - 3, 1.8) * 6);
    if (pKp > 0) textKp = `Магнітні збурення (Kp ${kp.toFixed(1)})`;
  }
  score -= pKp;
  breakdown.push({ text: textKp, value: -pKp });

  // WIND
  let pWind = 0;
  let textWind = `Вітер: Норма (${wind.toFixed(1)} м/с)`;
  if (wind > 7) {
    pWind = Math.round(Math.pow(wind - 7, 1.3) * 1.5);
    if (pWind > 0) textWind = `Сильний вітер (${wind.toFixed(1)} м/с)`;
  }
  score -= pWind;
  breakdown.push({ text: textWind, value: -pWind });

  // PRESSURE DIFF 24h
  let pressureDiff = 0;
  if (hourlyData && currentIndex >= 24) {
    const pressureHistory = hourlyData.surface_pressure.slice(currentIndex - 24, currentIndex);
    const maxP = Math.max(...pressureHistory);
    const minP = Math.min(...pressureHistory);
    pressureDiff = maxP - minP;
    
    if (pressureDiff > 5) {
      const p = Math.round(Math.pow(pressureDiff - 4, 1.6) * 1.5);
      score -= p;
      breakdown.push({ text: `Стрибок тиску (${pressureDiff.toFixed(1)} гПа/добу)`, value: -p });
    }
  }

  // TEMPERATURE VARIABILITY (TV) using apparent temperature
  if (hourlyData && currentIndex >= 24) {
    const tempHistory = hourlyData.apparent_temperature.slice(currentIndex - 24, currentIndex);
    const maxT = Math.max(...tempHistory);
    const minT = Math.min(...tempHistory);
    const tempDiff = maxT - minT;
    
    if (tempDiff > 8) {
      const p = Math.round((tempDiff - 8) * 1.5);
      score -= p;
      breakdown.push({ text: `Перепад температур (${tempDiff.toFixed(1)}°C/добу)`, value: -p });
    }
  }

  // SYNERGY PENALTIES (Symptoms)
  // Moon base
  if (moon.type === 'full') {
    score -= 5;
    symptoms.push({ text: `Ризик безсоння та тривожність (${moon.icon} Повня)`, value: -5 });
  } else if (moon.type === 'new') {
    score -= 5;
    symptoms.push({ text: `Апатія та занепад сил (${moon.icon} Новомісяччя)`, value: -5 });
  } else if (moon.type === 'first_quarter' || moon.type === 'last_quarter') {
    score -= 2;
    symptoms.push({ text: `Легка емоційна нестабільність (${moon.icon})`, value: -2 });
  }

  // 1. Духота
  if (apparentTemp > 24 && humidity > 55) {
    const p = Math.round((apparentTemp - 24) * (humidity - 55) * 0.4);
    score -= p;
    symptoms.push({ text: `🫁 Сильна задуха`, value: -p });
  }
  
  // 2. Риск мигрени (Фен / Шинук: Сильный ветер + падение давления)
  if (wind > 10 && pressureDiff > 5) {
    const p = 20;
    score -= p;
    symptoms.push({ text: `🧠 Мігрень та тривожність (Сильний вітер + Стрибок тиску)`, value: -p });
  } else if (pressureDiff > 5 && kp >= 3) {
    let p = 15 + Math.round((kp - 2) * 5);
    if (moon.type === 'full') p += 10;
    score -= p;
    symptoms.push({ text: moon.type === 'full' ? `🧠 Екстремальна мігрень (Буря + Тиск + Повня)` : `🧠 Ризик мігрені (Буря + Тиск)`, value: -p });
  }

  // 3. Суглоби (Відкладений ефект тиску + Вологість)
  let hadRecentPressureDrop = false;
  if (hourlyData && currentIndex >= 72) {
     const history3days = hourlyData.surface_pressure.slice(currentIndex - 72, currentIndex);
     const maxP3 = Math.max(...history3days);
     const minP3 = Math.min(...history3days);
     if (maxP3 - minP3 > 5) hadRecentPressureDrop = true;
  }
  if ((pressure < 1005 || hadRecentPressureDrop) && humidity > 60) {
    const p = 15;
    score -= p;
    symptoms.push({ text: `🦴 Ломота в суглобах (Вогкість + Барометричні зміни)`, value: -p });
  }

  // 4. Кардіоваскулярний ризик (AQI + Kp)
  if (kp >= 3 && aqi > 30) {
    const p = 25;
    score -= p;
    symptoms.push({ text: `🫀 Навантаження на серце (Магнітна буря + Забруднення)`, value: -p });
  }

  // 5. Температурна інверсія (Низький вітер + AQI)
  if (wind < 2 && aqi > 30) {
    const p = 15;
    score -= p;
    symptoms.push({ text: `😷 Ефект застою повітря (Накопичення полютантів)`, value: -p });
  }

  // 6. Продувной мороз
  if (apparentTemp < 10 && wind > 5) {
    const p = Math.round((10 - apparentTemp) * wind * 0.3);
    if (p > 0) {
      score -= p;
      symptoms.push({ text: `🥶 Переохолодження (Мороз + Вітер)`, value: -p });
    }
  }

  // 7. Гипертония (Высокое давление + Полная луна)
  if (pressure > 1020 && moon.type === 'full') {
    const p = 15;
    score -= p;
    symptoms.push({ text: `🩸 Гіпертонічний ризик (Високий тиск + Повня)`, value: -p });
  }

  // 8. Гипотония/Слабость (Низкое давление + Новолуние)
  if (pressure < 1000 && moon.type === 'new') {
    const p = 15;
    score -= p;
    symptoms.push({ text: `🥱 Екстремальна слабкість (Низький тиск + Новомісяччя)`, value: -p });
  }

  // 9. Нічні магнітні бурі та сон
  const hour = dateObj ? dateObj.getHours() : new Date().getHours();
  if ((hour >= 20 || hour <= 6) && kp >= 3) {
    const p = 15;
    score -= p;
    symptoms.push({ text: `😴 Порушення сну (Пригнічення мелатоніну магнітною бурею)`, value: -p });
  }



  return { score: Math.max(0, Math.min(100, score)), breakdown, symptoms, moon };
}

function updateTheme(score) {
  let color1, color2, statusMsg;

  if (score >= 80) {
    color1 = 'var(--grad-good-1)';
    color2 = 'var(--grad-good-2)';
    statusMsg = 'Відмінне самопочуття';
  } else if (score >= 50) {
    color1 = 'var(--grad-neutral-1)';
    color2 = 'var(--grad-neutral-2)';
    statusMsg = 'Можливий дискомфорт';
  } else {
    color1 = 'var(--grad-bad-1)';
    color2 = 'var(--grad-bad-2)';
    statusMsg = 'Складні погодні умови';
  }

  els.root.style.setProperty('--current-grad-1', color1);
  els.root.style.setProperty('--current-grad-2', color2);
  els.statusText.textContent = statusMsg;
}

function renderBreakdown(breakdown, symptoms) {
  els.breakdown.innerHTML = '';
  breakdown.forEach(item => {
    const isBonus = item.value === 0;
    const div = document.createElement('div');
    div.className = `breakdown-item ${isBonus ? 'bonus' : 'penalty'}`;
    div.innerHTML = `
      <span>${item.text}</span>
      <span>${isBonus ? '(0%)' : item.value + '%'}</span>
    `;
    els.breakdown.appendChild(div);
  });

  els.symptoms.innerHTML = '';
  if (symptoms && symptoms.length > 0) {
    const title = document.createElement('div');
    title.className = 'symptoms-title';
    title.innerText = 'Симптоми та ризики:';
    els.symptoms.appendChild(title);

    symptoms.forEach(item => {
      const div = document.createElement('div');
      div.className = `symptom-item`;
      div.innerHTML = `
        <span>${item.text}</span>
        <span class="symptom-penalty">${item.value}%</span>
      `;
      els.symptoms.appendChild(div);
    });
  }
}

function renderForecast(weatherData, kpForecastArray) {
  els.forecast.innerHTML = '';
  const hourly = weatherData.hourly;
  const times = hourly.time; // ISO strings
  
  // Group by day -> periods (Morning 09:00, Day 15:00, Evening 21:00)
  const daysMap = new Map();
  const now = new Date();
  
  times.forEach((t, index) => {
    // Only future or current day
    const dateObj = new Date(t);
    // Ignore past days completely
    if (dateObj.getDate() < now.getDate() && dateObj.getMonth() <= now.getMonth()) return; 

    const dayString = dateObj.toLocaleDateString('uk-UA', { weekday: 'long', month: 'short', day: 'numeric' });
    const hour = dateObj.getHours();
    
    let period = null;
    if (hour === 9) period = 'Ранок';
    else if (hour === 15) period = 'День';
    else if (hour === 21) period = 'Вечір';
    
    if (period) {
      if (!daysMap.has(dayString)) daysMap.set(dayString, []);
      
      const temp = hourly.temperature_2m[index];
      const apparentTemp = hourly.apparent_temperature[index];
      const humidity = hourly.relative_humidity_2m[index];
      const pressure = hourly.surface_pressure[index];
      const wind = hourly.wind_speed_10m[index];
      
      if (temp === null || apparentTemp === null || humidity === null || pressure === null || wind === null) return;
      
      const aqi = 20; // fallback AQI for forecast
      const kp = getKpForDate(kpForecastArray, dateObj);
      
      const { score, symptoms, moon } = calculateScoreAndBreakdown(temp, apparentTemp, humidity, pressure, wind, aqi, kp, hourly, index, dateObj);
      
      daysMap.get(dayString).push({ period, score, temp, apparentTemp, pressure, humidity, wind, kp, aqi, symptoms, moon });
    }
  });

  // We need initial "previous" values to compare the first forecast period against current weather
  let prevTemp = weatherData.current.temperature_2m;
  let prevHumidity = weatherData.current.relative_humidity_2m;
  let prevPressure = weatherData.current.surface_pressure;
  let prevWind = weatherData.current.wind_speed_10m;
  let prevKp = getKpForDate(kpForecastArray, new Date());
  let prevAqi = 20; // fallback current AQI or passed in

  // Render map
  for (const [dayString, periods] of Array.from(daysMap.entries()).slice(0, 3)) { // max 3 days
    if (periods.length === 0) continue;
    
    const dayDiv = document.createElement('div');
    dayDiv.className = 'forecast-day';
    
    let periodsHTML = '';
    periods.forEach(p => {
      let statusClass = 'good';
      if (p.score < 50) statusClass = 'bad';
      else if (p.score < 80) statusClass = 'neutral';
      
      // Calculate trends
      const tTemp = getTrend(p.temp, prevTemp, 18, 24);
      const tPress = getTrend(p.pressure, prevPressure, 1000, 1020);
      const tHum = getTrend(p.humidity, prevHumidity, 30, 60);
      const tWind = getTrend(p.wind, prevWind, 0, 7);
      const tKp = getTrend(p.kp, prevKp, 0, 3);
      const tAqi = getTrend(p.aqi, prevAqi, 0, 20);

      // Render forecasted symptoms
      let fSymptomsHTML = '';
      if (p.symptoms && p.symptoms.length > 0) {
        fSymptomsHTML = `<div class="f-symptoms">`;
        p.symptoms.forEach(sym => {
          fSymptomsHTML += `<div class="f-symptom-tag">${sym.text}</div>`;
        });
        fSymptomsHTML += `</div>`;
      }

      periodsHTML += `
        <div class="forecast-period ${statusClass}">
          <span class="time">${p.period} ${p.moon.icon}</span>
          <span class="score">${p.score}%</span>
          <div class="forecast-metrics">
            <div class="f-metric">
              <span class="f-val">${Math.round(p.temp)}°C <small>(${Math.round(p.apparentTemp)}°C)</small></span>
              <span class="f-trend" style="color: ${tTemp.color}">${tTemp.arrow}</span>
            </div>
            <div class="f-metric">
              <span class="f-val">${Math.round(p.pressure)} гПа</span>
              <span class="f-trend" style="color: ${tPress.color}">${tPress.arrow}</span>
            </div>
            <div class="f-metric">
              <span class="f-val">${Math.round(p.humidity)}%</span>
              <span class="f-trend" style="color: ${tHum.color}">${tHum.arrow}</span>
            </div>
            <div class="f-metric">
              <span class="f-val">${Math.round(p.wind)} м/с</span>
              <span class="f-trend" style="color: ${tWind.color}">${tWind.arrow}</span>
            </div>
            <div class="f-metric">
              <span class="f-val">Kp ${p.kp.toFixed(1)}</span>
              <span class="f-trend" style="color: ${tKp.color}">${tKp.arrow}</span>
            </div>
            <div class="f-metric">
              <span class="f-val">AQI ${Math.round(p.aqi)}</span>
              <span class="f-trend" style="color: ${tAqi.color}">${tAqi.arrow}</span>
            </div>
          </div>
          ${fSymptomsHTML}
        </div>
      `;
      
      // Update previous values for next period comparison
      prevTemp = p.temp;
      prevHumidity = p.humidity;
      prevPressure = p.pressure;
      prevWind = p.wind;
      prevKp = p.kp;
      prevAqi = p.aqi;
    });

    dayDiv.innerHTML = `
      <div class="forecast-day-title">${dayString}</div>
      <div class="forecast-periods">${periodsHTML}</div>
    `;
    els.forecast.appendChild(dayDiv);
  }
}

async function updateDashboard() {
  els.score.innerHTML = '--<span style="font-size: 0.5em">%</span>';
  els.location.textContent = locationName;
  els.breakdown.innerHTML = '<div style="font-size:0.9rem; text-align:center;">Аналіз даних...</div>';

  try {
    const [weather, airInfo, kpForecastArray] = await Promise.all([
      fetchWeatherData(currentLat, currentLon),
      fetchAirQuality(currentLat, currentLon),
      fetchKpForecast()
    ]);

    const temp = weather.current.temperature_2m;
    const apparentTemp = weather.current.apparent_temperature;
    const humidity = weather.current.relative_humidity_2m;
    const pressure = weather.current.surface_pressure;
    const wind = weather.current.wind_speed_10m;
    const aqi = airInfo.current.european_aqi;
    
    // Find current Kp
    const currentKp = getKpForDate(kpForecastArray, new Date());

    // Current index in hourly data
    const nowIndex = weather.hourly.time.findIndex(t => new Date(t).getTime() >= new Date().getTime());

    const { score, breakdown, symptoms } = calculateScoreAndBreakdown(
      temp, apparentTemp, humidity, pressure, wind, aqi, currentKp, weather.hourly, nowIndex, new Date()
    );
    
    renderBreakdown(breakdown, symptoms);
    renderForecast(weather, kpForecastArray);
    
    animateValue(els.score, 0, score, 1500);
    updateTheme(score);

  } catch (error) {
    console.error(error);
    els.statusText.textContent = 'Помилка завантаження даних';
    els.breakdown.innerHTML = '';
  }
}

function animateValue(obj, start, end, duration) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.innerHTML = Math.floor(progress * (end - start) + start) + '<span style="font-size: 0.5em">%</span>';
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

els.geoBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    alert('Геолокація не підтримується вашим браузером');
    return;
  }
  els.geoBtn.disabled = true;
  els.geoBtn.innerHTML = 'Визначення...';
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      currentLat = position.coords.latitude;
      currentLon = position.coords.longitude;
      locationName = 'Ваша геопозиція';
      await updateDashboard();
      els.geoBtn.disabled = false;
      els.geoBtn.innerHTML = `Оновлено`;
      setTimeout(() => els.geoBtn.innerHTML = `Оновити геопозицію`, 3000);
    },
    (error) => {
      alert('Не вдалося отримати геопозицію. Можливо, немає доступу.');
      els.geoBtn.disabled = false;
      els.geoBtn.innerHTML = 'Повторити спробу';
    },
    { timeout: 10000, maximumAge: 0 }
  );
});

updateDashboard();
