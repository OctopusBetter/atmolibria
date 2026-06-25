import './style.css';
import Chart from 'chart.js/auto';

let currentLat = 50.00;
let currentLon = 36.23;
let locationName = 'Харків (за замовчуванням)';

let pressureChartInstance = null;
let kpChartInstance = null;

const els = {
  score: document.getElementById('score'),
  statusText: document.getElementById('status-text'),
  location: document.getElementById('location'),
  temp: document.getElementById('temp'),
  humidity: document.getElementById('humidity'),
  pressure: document.getElementById('pressure'),
  wind: document.getElementById('wind'),
  aqi: document.getElementById('aqi'),
  kpIndex: document.getElementById('kp-index'),
  geoBtn: document.getElementById('geo-btn'),
  breakdown: document.getElementById('breakdown-container'),
  forecast: document.getElementById('forecast-container'),
  root: document.documentElement
};

async function fetchWeatherData(lat, lon) {
  // past_hours=24 for history, forecast_days=3 for forecast
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m&past_hours=24&forecast_days=3&timezone=auto`;
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

function calculateScoreAndBreakdown(temp, humidity, pressure, wind, aqi, kp, hourlyData, currentIndex) {
  let score = 100;
  let breakdown = [];

  // TEMPERATURE (Ideal 18-24)
  let pTemp = 0;
  let textTemp = `Температура: Норма (${temp.toFixed(1)}°C)`;
  if (temp > 24) {
    pTemp = Math.round(Math.pow(temp - 24, 1.4) * 1.5);
    if (pTemp > 0) textTemp = `Спекотно (${temp.toFixed(1)}°C)`;
  } else if (temp < 18) {
    pTemp = Math.round(Math.pow(18 - temp, 1.3) * 1.2);
    if (pTemp > 0) textTemp = `Прохолодно/Холодно (${temp.toFixed(1)}°C)`;
  }
  score -= pTemp;
  breakdown.push({ text: textTemp, value: -pTemp });

  // HUMIDITY (Ideal 30-60)
  let pHum = 0;
  let textHum = `Вологість: Норма (${humidity}%)`;
  if (humidity > 60) {
    pHum = Math.round(Math.pow(humidity - 60, 1.2) * 0.4);
    if (pHum > 0) textHum = `Вогко/Висока вологість (${humidity}%)`;
  } else if (humidity < 30) {
    pHum = Math.round(Math.pow(30 - humidity, 1.2) * 0.4);
    if (pHum > 0) textHum = `Сухе повітря (${humidity}%)`;
  }
  score -= pHum;
  breakdown.push({ text: textHum, value: -pHum });

  // PRESSURE (Ideal 1000-1020)
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

  // AQI (Ideal 0-20)
  let pAqi = 0;
  let textAqi = `Якість повітря: Норма (AQI ${Math.round(aqi)})`;
  if (aqi > 20) {
    pAqi = Math.round(Math.pow(aqi - 20, 1.1) * 0.4);
    if (pAqi > 0) textAqi = `Забруднення повітря (AQI ${Math.round(aqi)})`;
  }
  score -= pAqi;
  breakdown.push({ text: textAqi, value: -pAqi });

  // KP (Ideal 0-3)
  let pKp = 0;
  let textKp = `Магнітний фон: Норма (Kp ${kp.toFixed(1)})`;
  if (kp > 3) {
    pKp = Math.round(Math.pow(kp - 3, 1.8) * 6);
    if (pKp > 0) textKp = `Магнітні збурення (Kp ${kp.toFixed(1)})`;
  }
  score -= pKp;
  breakdown.push({ text: textKp, value: -pKp });

  // WIND (Ideal 0-7 m/s)
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
      breakdown.push({ text: `Стрибок тиску (${pressureDiff.toFixed(1)} гПа за 24 год)`, value: -p });
    }
  }

  // SYNERGY PENALTIES
  // 1. Духота
  if (temp > 24 && humidity > 55) {
    const p = Math.round((temp - 24) * (humidity - 55) * 0.4);
    score -= p;
    breakdown.push({ text: `[Синдром] Сильна задуха`, value: -p });
  }
  // 2. Риск мигрени
  if (pressureDiff > 5 && kp >= 3) {
    const p = 15 + Math.round((kp - 2) * 5);
    score -= p;
    breakdown.push({ text: `[Синдром] Ризик мігрені (тиск + буря)`, value: -p });
  }
  // 3. Суставы
  if (pressure < 1005 && humidity > 60) {
    const p = 15;
    score -= p;
    breakdown.push({ text: `[Синдром] Ломота в суглобах (вогкість + низький тиск)`, value: -p });
  }
  // 4. Продувной мороз
  if (temp < 10 && wind > 5) {
    const p = Math.round((10 - temp) * wind * 0.3);
    if (p > 0) {
      score -= p;
      breakdown.push({ text: `[Синдром] Сильний морозний вітер`, value: -p });
    }
  }

  return { score: Math.max(0, Math.min(100, score)), breakdown };
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

function renderBreakdown(breakdown) {
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
      const humidity = hourly.relative_humidity_2m[index];
      const pressure = hourly.surface_pressure[index];
      const wind = hourly.wind_speed_10m[index];
      
      if (temp === null || humidity === null || pressure === null || wind === null) return;
      
      const aqi = 20; // fallback AQI for forecast
      const kp = getKpForDate(kpForecastArray, dateObj);
      
      const { score } = calculateScoreAndBreakdown(temp, humidity, pressure, wind, aqi, kp, hourly, index);
      
      daysMap.get(dayString).push({ period, score });
    }
  });

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
      
      periodsHTML += `
        <div class="forecast-period ${statusClass}">
          <span class="time">${p.period}</span>
          <span class="score">${p.score}%</span>
        </div>
      `;
    });

    dayDiv.innerHTML = `
      <div class="forecast-day-title">${dayString}</div>
      <div class="forecast-periods">${periodsHTML}</div>
    `;
    els.forecast.appendChild(dayDiv);
  }
}

function renderCharts(weatherData, kpForecastArray) {
  const hourly = weatherData.hourly;
  const nowIndex = hourly.time.findIndex(t => new Date(t).getTime() >= new Date().getTime());
  const startIndex = Math.max(0, nowIndex - 24);
  
  const pressureData = hourly.surface_pressure.slice(startIndex, startIndex + 24);
  const timeLabels = hourly.time.slice(startIndex, startIndex + 24).map(t => new Date(t).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));
  
  const kpData = hourly.time.slice(startIndex, startIndex + 24).map(t => getKpForDate(kpForecastArray, new Date(t)));

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false } },
      y: { border: { display: false } }
    },
    elements: { line: { tension: 0.4 }, point: { radius: 2 } }
  };

  if (pressureChartInstance) pressureChartInstance.destroy();
  const ctxPressure = document.getElementById('pressureChart').getContext('2d');
  pressureChartInstance = new Chart(ctxPressure, {
    type: 'line',
    data: {
      labels: timeLabels,
      datasets: [{
        label: 'Атм. тиск (гПа)',
        data: pressureData,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true
      }]
    },
    options: {
      ...chartOptions,
      plugins: { ...chartOptions.plugins, title: { display: true, text: 'Атмосферний тиск (24 год)' } }
    }
  });

  if (kpChartInstance) kpChartInstance.destroy();
  const ctxKp = document.getElementById('kpChart').getContext('2d');
  kpChartInstance = new Chart(ctxKp, {
    type: 'bar',
    data: {
      labels: timeLabels,
      datasets: [{
        label: 'Kp Індекс',
        data: kpData,
        backgroundColor: kpData.map(v => v >= 4 ? 'rgba(239, 68, 68, 0.6)' : 'rgba(16, 185, 129, 0.6)'),
        borderRadius: 4
      }]
    },
    options: {
      ...chartOptions,
      plugins: { ...chartOptions.plugins, title: { display: true, text: 'Магнітні бурі Kp (24 год)' } }
    }
  });
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
    const humidity = weather.current.relative_humidity_2m;
    const pressure = weather.current.surface_pressure;
    const wind = weather.current.wind_speed_10m;
    const aqi = airInfo.current.european_aqi;
    
    // Find current Kp
    const currentKp = getKpForDate(kpForecastArray, new Date());

    els.temp.textContent = `${temp.toFixed(1)}°C`;
    els.humidity.textContent = `${humidity}%`;
    els.pressure.textContent = `${Math.round(pressure)} гПа`;
    els.wind.textContent = `${wind.toFixed(1)} м/с`;
    els.aqi.textContent = Math.round(aqi);
    els.kpIndex.textContent = currentKp.toFixed(1);

    // Current index in hourly data
    const nowIndex = weather.hourly.time.findIndex(t => new Date(t).getTime() >= new Date().getTime());

    const { score, breakdown } = calculateScoreAndBreakdown(
      temp, humidity, pressure, wind, aqi, currentKp, weather.hourly, nowIndex
    );
    
    renderBreakdown(breakdown);
    renderForecast(weather, kpForecastArray);
    renderCharts(weather, kpForecastArray);
    
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
      alert('Не вдалося отримати геопозицію.');
      els.geoBtn.disabled = false;
      els.geoBtn.innerHTML = 'Повторити спробу';
    }
  );
});

updateDashboard();
