  let tableData = [];
  let currentPage = 1;
  const rowsPerPage = 10;
  let total = 0;
let chart = null;
let uniqueUsers = new Set();
  // Declare global variables for ageBuckets and genderCounts
  let ageBuckets = {};
  let genderCounts = {};


  async function handleFormSubmit(form, action) {
      const formData = new FormData(form);
      const endpoint = action === "login" ? "/login" : "/register";

      const res = await fetch(endpoint, {
        method: "POST",
        body: formData
      });

      const status = document.getElementById("status");
      if (res.ok) {
        const data = await res.json();
        if (action === "register") {
          status.textContent = `Welcome ${data.annotator_id}! Registration successful. Redirecting to login...`;
          setTimeout(() => {
            status.textContent = "";
          }, 2000);
        } else {
          localStorage.setItem("annotator_id", data.annotator_id);
          const session_id = "session_" + Date.now();
          localStorage.setItem("session_id", session_id);

          try {
            const res = await fetch(`/annotations/${data.annotator_id}`);
            const logs = res.ok ? await res.json() : [];
            const meta = await fetch("/contents/meta.json");
            const total = (await meta.json()).length;
            const completed = new Set(logs.map(r => r.image_id));
            if (completed.size >= total) {
              window.location.href = "/static/completed.html";
              return;
            }
          } catch {}

          window.location.href = "/static/progress.html";
        }
      } else {
        const error = await res.json();
        if (action === "register" && error.detail === "Annotator ID already exists") {
          status.textContent = "Error: This ID is already registered.";
        } else {
          status.textContent = "Error: " + (error.detail || error.message);
        }
      }
    }
// --- Annotator Registration Form logic for Admin page ---
document.addEventListener("DOMContentLoaded", function () {
  const registerForm = document.getElementById("registerForm");
  if (registerForm) {
    registerForm.addEventListener("submit", async function (e) {
      e.preventDefault();

      const idEl = document.getElementById("newAnnotatorId");
      const pwEl = document.getElementById("newAnnotatorPassword");
      const ageEl = document.getElementById("newAnnotatorAge");
      const genderEl = document.getElementById("newAnnotatorGender");
      const registerResult = document.getElementById("registerResult");

      if (!idEl || !pwEl || !ageEl || !genderEl || !registerResult) {
        console.error("Missing one or more registration form elements.");
        return;
      }

      const annotator_id = idEl.value;
      const password = pwEl.value;
      const age = ageEl.value;
      const gender = genderEl.value;

      if (!annotator_id || !password || !age || !gender) {
        registerResult.style.color = "red";
        registerResult.textContent = "All fields are required.";
        return;
      }

      registerResult.textContent = "Registering...";

      try {
        const res = await fetch("/register", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `annotator_id=${encodeURIComponent(annotator_id)}&password=${encodeURIComponent(password)}&age=${encodeURIComponent(age)}&gender=${encodeURIComponent(gender)}`
        });

        if (!res.ok) {
          const error = await res.json();
          throw error;
        }

        const data = await res.json();
        registerResult.style.color = "green";
        registerResult.textContent = "Annotator registered successfully!";
        registerForm.reset();
      } catch (err) {
        registerResult.style.color = "red";
        registerResult.textContent = err?.detail || "Registration failed";
      }
    });
  }
});

  async function loadSummaryData() {
    const res = await fetch("/contents/meta.json");
    const meta = await res.json();
    total = meta.length;
    // Move stats to All Users tab instead of Find User
    const allUsersDiv = document.getElementById("allUsers");
    const statsDiv = document.createElement("div");

    statsDiv.innerHTML = `
      <h2>All Registered Annotators</h2>
      <button onclick="downloadJson()">Download JSON</button>
    `;
    allUsersDiv.prepend(statsDiv);

    try {
      // --- NEW LOGIC FOR SUMMARY-ONLY FORMAT ---
      const allRes = await fetch("/admin/all-annotators");
      const allData = await allRes.json();

      const summaryOnly = allData.filter(d => d.summary);

      // Prepare tableData but do not render table/chart here
      tableData = summaryOnly.map(d => {
        const completed = d.completed;
        const totalTasks = d.total;
        let progress_status = "not started";
        if (completed === totalTasks) progress_status = "completed";
        else if (completed > 0) progress_status = "in progress";

        return {
          annotator_id: d.annotator_id,
          completed,
          age: d.age,
          gender: d.gender,
          progress_status,
          total_time: d.total_time ?? 0
        };
      });

      // Prepare buckets and counts for charts
      ageBuckets = { "10s": 0, "20s": 0, "30s": 0, "40s": 0, "50s+": 0 };
      genderCounts = {};
      uniqueUsers = new Set();

      summaryOnly.forEach(d => {
        uniqueUsers.add(d.annotator_id);
        const gender = d.gender || "unknown";
        genderCounts[gender] = (genderCounts[gender] || 0) + 1;

        const age = parseInt(d.age);
        if (!isNaN(age)) {
          if (age < 20) ageBuckets["10s"]++;
          else if (age < 30) ageBuckets["20s"]++;
          else if (age < 40) ageBuckets["30s"]++;
          else if (age < 50) ageBuckets["40s"]++;
          else ageBuckets["50s+"]++;
        }
      });

      // Chart.js chart instances for proper destroy/recreate
      window.ageBuckets = ageBuckets;
      let ageChartInstance = null;
      let currentAgeChartType = 'bar';
      function drawAgeChart(type) {
        const ctx = document.getElementById("ageChart").getContext("2d");
        if (ageChartInstance) ageChartInstance.destroy();  // Destroy existing chart
        ageChartInstance = new Chart(ctx, {
          type,
          data: {
            labels: Object.keys(ageBuckets),
            datasets: [{
              label: 'Users by Age Group',
              data: Object.values(ageBuckets),
              backgroundColor: ['#4bc0c0', '#36a2eb', '#ffcd56', '#ff6384', '#9966ff']
            }]
          },
          options: {
            responsive: true,
            plugins: {
              legend: { display: type === 'pie' },
              title: { display: true, text: 'Users by Age Group' },
              tooltip: { enabled: true }
            },
            scales: type === 'bar' ? { y: { beginAtZero: true } } : {}
          }
        });
      }
      function toggleAgeChart() {
        currentAgeChartType = currentAgeChartType === 'bar' ? 'pie' : 'bar';
        drawAgeChart(currentAgeChartType);
      }
      window.toggleAgeChart = toggleAgeChart;
      drawAgeChart(currentAgeChartType);

      let genderChartInstance = null;
      let currentGenderChartType = 'bar';
      function drawGenderChart(type) {
        const ctx = document.getElementById("genderChart").getContext("2d");
        if (genderChartInstance) genderChartInstance.destroy(); // Destroy existing chart
        genderChartInstance = new Chart(ctx, {
          type,
          data: {
            labels: Object.keys(genderCounts),
            datasets: [{
              data: Object.values(genderCounts),
              backgroundColor: ['#36A2EB', '#FF6384', '#FFCE56', '#AAAAAA']
            }]
          },
          options: {
            responsive: true,
            plugins: {
              legend: { position: 'bottom' },
              title: { display: true, text: 'Gender Distribution' },
              tooltip: { enabled: true }
            },
            scales: type === 'bar' ? { y: { beginAtZero: true } } : {}
          }
        });
      }
      function toggleGenderChart() {
        currentGenderChartType = currentGenderChartType === 'pie' ? 'bar' : 'pie';
        drawGenderChart(currentGenderChartType);
      }
      window.toggleGenderChart = toggleGenderChart;
      drawGenderChart(currentGenderChartType);

      // --- Average Time by Age and Gender charts ---
      // Time aggregation
      const timeByAge = { "10s": [], "20s": [], "30s": [], "40s": [], "50s+": [] };
      const timeByGender = {};

      summaryOnly.forEach(d => {
        if (d.completed > 0 && d.total_time) {
          const avg = d.total_time / d.completed;

          const age = parseInt(d.age);
          if (!isNaN(age)) {
            if (age < 20) timeByAge["10s"].push(avg);
            else if (age < 30) timeByAge["20s"].push(avg);
            else if (age < 40) timeByAge["30s"].push(avg);
            else if (age < 50) timeByAge["40s"].push(avg);
            else timeByAge["50s+"].push(avg);
          }

          const gender = d.gender || "unknown";
          if (!timeByGender[gender]) timeByGender[gender] = [];
          timeByGender[gender].push(avg);
        }
      });

      function avg(arr) {
        return arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;
      }

      // Store chart instances for time charts to destroy before re-creating
      let avgTimeAgeChartInstance = null;
      let avgTimeGenderChartInstance = null;
      function drawAvgTimeAgeChart() {
        const ctx = document.getElementById("avgTimeAgeChart").getContext("2d");
        if (avgTimeAgeChartInstance) avgTimeAgeChartInstance.destroy();
        avgTimeAgeChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: Object.keys(timeByAge),
            datasets: [{
              label: 'Avg Time (s) by Age Group',
              data: Object.values(timeByAge).map(avg),
              backgroundColor: '#4bc0c0'
            }]
          },
          options: {
            plugins: {
              title: { display: true, text: 'Average Time per Annotation by Age' },
              tooltip: { enabled: true },
              legend: { display: false }
            },
            scales: { y: { beginAtZero: true } }
          }
        });
      }
      function drawAvgTimeGenderChart() {
        const ctx = document.getElementById("avgTimeGenderChart").getContext("2d");
        if (avgTimeGenderChartInstance) avgTimeGenderChartInstance.destroy();
        avgTimeGenderChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: Object.keys(timeByGender),
            datasets: [{
              label: 'Avg Time (s) by Gender',
              data: Object.values(timeByGender).map(avg),
              backgroundColor: '#ff9f40'
            }]
          },
          options: {
            plugins: {
              title: { display: true, text: 'Average Time per Annotation by Gender' },
              tooltip: { enabled: true },
              legend: { display: false }
            },
            scales: { y: { beginAtZero: true } }
          }
        });
      }
      drawAvgTimeAgeChart();
      drawAvgTimeGenderChart();

      fetch('/admin/all-annotations')
        .then(response => response.json())
        .then(data => {
          renderAnswerCharts(data);
        })
        .catch(error => {
          console.error("Error loading answer statistics:", error);
        });

      // Store summaryOnly globally for later use in tab switching, etc.
      window.summaryOnlyGlobal = summaryOnly;
      // Return summaryOnly for use in other functions
      return summaryOnly;
    } catch (err) {
      console.error("Error loading summary:", err);
      const tbody = document.querySelector("#summaryTable tbody");
      const tbody2 = document.querySelector("#summaryOnlyTable tbody");
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5">No data available</td></tr>`;
      }
      if (tbody2) {
        tbody2.innerHTML = `<tr><td colspan="5">No summary data available</td></tr>`;
      }
      return [];
    }
  }

  // New function: loadSearch (merged with loadSearchUI)
  function loadSearch(summaryOnly) {
    // Set tableData for search tab
    tableData = summaryOnly.map(d => {
      const completed = d.completed;
      const totalTasks = d.total;
      let progress_status = "not started";
      if (completed === totalTasks) progress_status = "completed";
      else if (completed > 0) progress_status = "in progress";
      return {
        annotator_id: d.annotator_id,
        completed,
        age: d.age,
        gender: d.gender,
        progress_status,
        total_time: d.total_time ?? 0
      };
    });

    // Add header with CSV and Filter label
    const headerDiv = document.createElement("div");
    headerDiv.style.margin = "20px";
    headerDiv.innerHTML = `
      <h2>Annotator Search</h2>
      <div style="margin-bottom: 10px;">
        <label for="filterType">Filter by:</label>
        <select id="filterType" style="margin-left: 10px;">
          <option value="id">ID</option>
          <option value="age">Age</option>
          <option value="gender">Gender</option>
          <option value="progress">Progress</option>
        </select>
      </div>
    `;

    const filterInputGroup = document.createElement("div");
    filterInputGroup.id = "filterInputGroup";
    headerDiv.appendChild(filterInputGroup);

    const container = document.getElementById("searchHeaderContainer");
    if (container) {
      container.innerHTML = "";
      container.appendChild(headerDiv);
    }

    // Add pagination controls
    if (!document.getElementById("paginationControls")) {
      const pagDiv = document.createElement("div");
      pagDiv.id = "paginationControls";
      pagDiv.style.margin = "20px";
      document.getElementById("searchContainer").appendChild(pagDiv);
    }

    function updateFilterInput() {
      const group = document.getElementById("filterInputGroup");
      group.innerHTML = "";

      const type = document.getElementById("filterType").value;

      if (type === "id") {
        const input = document.createElement("input");
        input.type = "text";
        input.id = "filterInput";
        input.placeholder = "Enter annotator ID";
        input.addEventListener("input", () => {
          currentPage = 1;
          renderTable();
        });
        group.appendChild(input);
      } else if (type === "age") {
        const min = document.createElement("input");
        min.type = "number";
        min.placeholder = "Min age";
        min.id = "ageMin";
        const max = document.createElement("input");
        max.type = "number";
        max.placeholder = "Max age";
        max.id = "ageMax";

        min.addEventListener("input", () => { currentPage = 1; renderTable(); });
        max.addEventListener("input", () => { currentPage = 1; renderTable(); });

        group.appendChild(min);
        group.appendChild(max);
      } else if (type === "gender") {
        const select = document.createElement("select");
        select.id = "filterInput";
        ["", "male", "female", "other"].forEach(opt => {
          const o = document.createElement("option");
          o.value = opt;
          o.textContent = opt ? opt.charAt(0).toUpperCase() + opt.slice(1) : "-- Select Gender --";
          select.appendChild(o);
        });
        select.addEventListener("change", () => {
          currentPage = 1;
          renderTable();
        });
        group.appendChild(select);
      } else if (type === "progress") {
        const select = document.createElement("select");
        select.id = "filterInput";
        ["", "completed", "in progress", "not started"].forEach(opt => {
          const o = document.createElement("option");
          o.value = opt;
          o.textContent = opt ? opt : "-- Select Progress --";
          select.appendChild(o);
        });
        select.addEventListener("change", () => {
          currentPage = 1;
          renderTable();
        });
        group.appendChild(select);
      }
    }

    const filterTypeSelect = document.getElementById("filterType");
    if (filterTypeSelect) {
      filterTypeSelect.addEventListener("change", updateFilterInput);
      filterTypeSelect.value = "id";
      updateFilterInput();
      const input = document.getElementById("filterInput");
      if (input) input.value = "";
      currentPage = 1;
      renderTable();
    }

    renderChart();
  }

  // New function: loadAll
  function loadAll(summaryOnly) {
    const userCountElement = document.getElementById("userCount");
    if (userCountElement) {
      userCountElement.textContent = `Total Annotators Registered: ${uniqueUsers.size}`;
    }
    
    // Fill allUsersTable
    const tbodyAllContainer = document.getElementById("allUsersTable");
    if (tbodyAllContainer) {
      tbodyAllContainer.innerHTML = ""; // Clear any existing content
      const table = document.createElement("table");
      table.innerHTML = `
        <thead>
          <tr>
            <th>ID</th><th>Age</th><th>Gender</th><th>Progress</th><th>Avg Time (s)</th>
          </tr>
        </thead>
        <tbody>
          ${summaryOnly.map(d => {
            const progress = `${d.completed} / ${d.total}`;
            const avgTime = d.total_time && d.completed ? (d.total_time / d.completed).toFixed(1) : "N/A";
            return `
              <tr>
                <td>${d.annotator_id}</td>
                <td>${d.age}</td>
                <td>${d.gender}</td>
                <td>${progress}</td>
                <td>${avgTime}</td>
              </tr>`;
          }).join("")}
        </tbody>
      `;
      tbodyAllContainer.appendChild(table);
    }
  }

  
  function renderTable() {
    const filterType = document.getElementById("filterType").value;
    const filterValue = (() => {
      if (filterType === "age") {
        const min = document.getElementById("ageMin") ? document.getElementById("ageMin").value : "";
        const max = document.getElementById("ageMax") ? document.getElementById("ageMax").value : "";
        return {min, max};
      }
      const input = document.getElementById("filterInput");
      return input ? input.value.toLowerCase() : "";
    })();

    const filtered = tableData.filter(d => {
      if (filterType === "id") return !filterValue || d.annotator_id.toLowerCase().includes(filterValue);
      if (filterType === "age") {
        const min = filterValue.min !== "" ? Number(filterValue.min) : null;
        const max = filterValue.max !== "" ? Number(filterValue.max) : null;
        if (min !== null && d.age < min) return false;
        if (max !== null && d.age > max) return false;
        return true;
      }
      if (filterType === "gender") return filterValue === "" || (d.gender && d.gender.toLowerCase() === filterValue.toLowerCase());
      if (filterType === "progress") {
         if (filterValue === "") return true;
         return d.progress_status === filterValue;
      }
      return true;
    });

    const start = (currentPage - 1) * rowsPerPage;
    const paginated = filtered.slice(start, start + rowsPerPage);

    const tbody = document.querySelector("#searchTable tbody");
    tbody.innerHTML = "";
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5">No results found for filter "${filterType === "age" ? (filterValue.min + "-" + filterValue.max) : filterValue}"</td></tr>`;
      document.getElementById("paginationControls").innerHTML = "";
      return;
    }

    paginated.forEach(d => {
      const avgTime = d.total_time && d.completed ? (d.total_time / d.completed).toFixed(1) : "N/A";
      tbody.innerHTML += `<tr><td>${d.annotator_id}</td><td>${d.age}</td><td>${d.gender}</td><td>${d.completed} / ${total}</td><td>${avgTime}</td></tr>`;
    });

    const paginationDiv = document.getElementById("paginationControls");
    paginationDiv.innerHTML = "";
    const totalPages = Math.ceil(filtered.length / rowsPerPage);
    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement("button");
      btn.textContent = i;
      if (i === currentPage) btn.disabled = true;
      btn.onclick = () => {
        currentPage = i;
        renderTable();
      };
      paginationDiv.appendChild(btn);
    }
  }

function renderChart() {
  const canvas = document.getElementById("progressChart");
  if (!canvas) return;  // Exit early if the element is not found

  const labels = tableData.map(d => d.annotator_id);
  const data = tableData.map(d => d.completed);

  if (chart) chart.destroy();

  const ctx = canvas.getContext("2d");
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Completed Tasks',
        data: data,
        backgroundColor: 'rgba(54, 162, 235, 0.7)'
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Annotation Progress per User' }
      }
    }
  });
}

  function downloadJson() {
    fetch("/admin/all-annotations")
      .then(res => res.json())
      .then(data => {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "all-annotations.json";
        a.click();
        URL.revokeObjectURL(url);
      });
  }

// No longer need loadSearchUI or its DOMContentLoaded hook

    window.renderTable = renderTable;
    // Refactor: loadSummaryData then loadSearch and loadAll
    loadSummaryData().then(summaryOnly => {
      loadAll(summaryOnly);
    });


    function downloadChart(canvasId) {
      const canvas = document.getElementById(canvasId);
      const link = document.createElement("a");
      link.download = `${canvasId}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    }

    function showSubTab(tabId) {
      const subtabs = ['annotatorStatsTab', 'answerStatsTab'];
      subtabs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === tabId) ? 'block' : 'none';
      });
    }

  function showTab(tabId) {
    const tabs = ['summarySection', 'search', 'allUsers','registerTab'];
    tabs.forEach(id => {
      const tab = document.getElementById(id);
      if (tab) {
        tab.style.display = (id === tabId) ? 'block' : 'none';
      }
    });

    if (tabId === 'search' && window.summaryOnlyGlobal) {
      loadSearch(window.summaryOnlyGlobal);
      
    } else if (tabId === 'allUsers' && window.summaryOnlyGlobal) {
      loadAll(window.summaryOnlyGlobal);
    }
  }

  // Default view

    // Default view: ensure DOM is loaded before showing tab

function refreshDB() {
    fetch("/admin/refresh-db", { method: "POST" })
      .then(response => response.json())
      .then(data => {
        alert("Database refreshed: " + data.message);
        location.reload();
      })
      .catch(error => {
        console.error("Error refreshing DB:", error);
        alert("Failed to refresh the database.");
      });
  }
// Render Answer Stats charts from annotation data
    function renderAnswerCharts(data) {
      const answerCounts = {};
      const answerByGender = {};
      const answerByAgeGroup = { "10s": {}, "20s": {}, "30s": {}, "40s": {}, "50s+": {} };

      data.forEach(d => {
        const ans = d.answer;
        const gender = d.gender || "unknown";
        const age = parseInt(d.age);
        if (!ans) return;

        // Total
        answerCounts[ans] = (answerCounts[ans] || 0) + 1;

        // Gender
        if (!answerByGender[gender]) answerByGender[gender] = {};
        answerByGender[gender][ans] = (answerByGender[gender][ans] || 0) + 1;

        // Age group
        let ageGroup = "unknown";
        if (!isNaN(age)) {
          if (age < 20) ageGroup = "10s";
          else if (age < 30) ageGroup = "20s";
          else if (age < 40) ageGroup = "30s";
          else if (age < 50) ageGroup = "40s";
          else ageGroup = "50s+";
        }
        if (!answerByAgeGroup[ageGroup]) answerByAgeGroup[ageGroup] = {};
        answerByAgeGroup[ageGroup][ans] = (answerByAgeGroup[ageGroup][ans] || 0) + 1;
      });

      // Unique answers
      const allAnswers = [...new Set(Object.keys(answerCounts)
        .concat(...Object.values(answerByGender).map(o => Object.keys(o)))
        .concat(...Object.values(answerByAgeGroup).map(o => Object.keys(o))))];

      // Chart.js chart instances for answer stats
      if (!window.totalAnswersChartInstance) window.totalAnswersChartInstance = null;
      if (!window.genderAnswersChartInstance) window.genderAnswersChartInstance = null;
      if (!window.ageAnswersChartInstance) window.ageAnswersChartInstance = null;
      // Total Answers Chart
      if (document.getElementById("totalAnswersChart")) {
        const ctx = document.getElementById("totalAnswersChart").getContext("2d");
        if (window.totalAnswersChartInstance) window.totalAnswersChartInstance.destroy();
        window.totalAnswersChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: allAnswers,
            datasets: [{
              label: 'Total Answers',
              data: allAnswers.map(a => answerCounts[a] || 0),
              backgroundColor: '#42a5f5'
            }]
          },
          options: {
            plugins: {
              title: { display: true, text: 'Total Answer Distribution' },
              legend: { display: false },
              tooltip: { enabled: true }
            },
            responsive: false,
            scales: { y: { beginAtZero: true } }
          }
        });
      }
      // Gender Distribution
      if (document.getElementById("genderAnswersChart")) {
        const ctx = document.getElementById("genderAnswersChart").getContext("2d");
        if (window.genderAnswersChartInstance) window.genderAnswersChartInstance.destroy();
        window.genderAnswersChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: allAnswers,
            datasets: Object.entries(answerByGender).map(([g, o]) => ({
              label: g,
              data: allAnswers.map(a => o[a] || 0),
              backgroundColor: g === "male" ? '#42a5f5' : '#ef5350'
            }))
          },
          options: {
            plugins: {
              title: { display: true, text: 'Answer Distribution by Gender' },
              legend: { position: 'bottom' },
              tooltip: { enabled: true }
            },
            responsive: false,
            scales: { y: { beginAtZero: true } }
          }
        });
      }
      // Age Distribution
      if (document.getElementById("ageAnswersChart")) {
        const ctx = document.getElementById("ageAnswersChart").getContext("2d");
        if (window.ageAnswersChartInstance) window.ageAnswersChartInstance.destroy();
        window.ageAnswersChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: allAnswers,
            datasets: Object.entries(answerByAgeGroup).map(([ageGroup, o]) => ({
              label: ageGroup,
              data: allAnswers.map(a => o[a] || 0),
              backgroundColor: {
                "10s": '#4db6ac',   // Teal
                "20s": '#42a5f5',   // Blue
                "30s": '#ffca28',   // Yellow
                "40s": '#7986cb',   // Indigo
                "50s+": '#ba68c8'   // Purple
              }[ageGroup]
            }))
          },
          options: {
            plugins: {
              title: { display: true, text: 'Answer Distribution by Age Group' },
              legend: { position: 'bottom' },
              tooltip: { enabled: true }
            },
            responsive: false,
            scales: { y: { beginAtZero: true } }
          }
        });
      }

      // --- Additional Charts by input_type and model_id ---
      const answerByInputType = {};
      const answerByModelId = {};

      data.forEach(d => {
        const ans = d.answer;
        if (!ans) return;

        const inputType = d.input_type || "unknown";
        const modelId = d.model_id || "unknown";

        if (!answerByInputType[inputType]) answerByInputType[inputType] = {};
        answerByInputType[inputType][ans] = (answerByInputType[inputType][ans] || 0) + 1;

        if (!answerByModelId[modelId]) answerByModelId[modelId] = {};
        answerByModelId[modelId][ans] = (answerByModelId[modelId][ans] || 0) + 1;
      });

      // Use placeholder containers for per-input-type and per-model charts
      const inputChartContainer = document.getElementById("perInputTypeCharts");
      if (Object.keys(answerByInputType).length === 0) {
        inputChartContainer.innerHTML = "<p>No input type data available.</p>";
      } else {
        inputChartContainer.innerHTML = "<h3>Answer Distribution by Input Type</h3>";
        Object.entries(answerByInputType).forEach(([inputType, counts], idx) => {
          const canvas = document.createElement("canvas");
          canvas.id = `inputTypeChart_${idx}`;
          canvas.width = 500;
          canvas.height = 300;
          inputChartContainer.appendChild(canvas);
          new Chart(canvas.getContext("2d"), {
            type: 'bar',
            data: {
              labels: allAnswers,
              datasets: [{
                label: inputType,
                data: allAnswers.map(a => counts[a] || 0),
                backgroundColor: '#81c784'
              }]
            },
            options: {
              plugins: {
                title: { display: true, text: `Input Type: ${inputType}` },
                legend: { display: false }
              },
              responsive: false,
              scales: { y: { beginAtZero: true } }
            }
          });
        });
      }

      const modelChartContainer = document.getElementById("perModelCharts");
      if (Object.keys(answerByModelId).length === 0) {
        modelChartContainer.innerHTML = "<p>No model ID data available.</p>";
      } else {
        modelChartContainer.innerHTML = "<h3>Answer Distribution by Model ID</h3>";
        Object.entries(answerByModelId).forEach(([modelId, counts], idx) => {
          const canvas = document.createElement("canvas");
          canvas.id = `modelIdChart_${idx}`;
          canvas.width = 500;
          canvas.height = 300;
          modelChartContainer.appendChild(canvas);
          new Chart(canvas.getContext("2d"), {
            type: 'bar',
            data: {
              labels: allAnswers,
              datasets: [{
                label: modelId,
                data: allAnswers.map(a => counts[a] || 0),
                backgroundColor: '#7986cb'
              }]
            },
            options: {
              plugins: {
                title: { display: true, text: `Model: ${modelId}` },
                legend: { display: false }
              },
              responsive: false,
              scales: { y: { beginAtZero: true } }
            }
          });
        });
      }
    }