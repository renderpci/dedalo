<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dédalo API Performance Monitor</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
        }

        .header {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 30px;
            margin-bottom: 20px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }

        .header h1 {
            color: #2d3748;
            font-size: 32px;
            margin-bottom: 10px;
        }

        .header p {
            color: #718096;
            font-size: 16px;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }

        .stat-card {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .stat-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        }

        .stat-card .label {
            color: #718096;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
        }

        .stat-card .value {
            color: #2d3748;
            font-size: 32px;
            font-weight: 700;
        }

        .stat-card .unit {
            color: #a0aec0;
            font-size: 16px;
            margin-left: 4px;
        }

        .controls {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            align-items: center;
        }

        .controls label {
            color: #4a5568;
            font-weight: 600;
            margin-right: 8px;
        }

        .controls input,
        .controls select {
            padding: 8px 12px;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.2s;
        }

        .controls input:focus,
        .controls select:focus {
            outline: none;
            border-color: #667eea;
        }

        .controls button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .controls button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .requests-table {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
            overflow-x: auto;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th {
            background: #f7fafc;
            color: #4a5568;
            font-weight: 600;
            text-align: left;
            padding: 12px;
            border-bottom: 2px solid #e2e8f0;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        td {
            padding: 12px;
            border-bottom: 1px solid #e2e8f0;
            color: #2d3748;
        }

        tr:hover {
            background: #f7fafc;
        }

        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
        }

        .badge-slow {
            background: #fed7d7;
            color: #c53030;
        }

        .badge-normal {
            background: #c6f6d5;
            color: #2f855a;
        }

        .badge-error {
            background: #feb2b2;
            color: #9b2c2c;
        }

        .checkpoint-details {
            font-size: 12px;
            color: #718096;
            margin-top: 4px;
        }

        .expandable {
            cursor: pointer;
            user-select: none;
        }

        .checkpoint-list {
            display: none;
            margin-top: 8px;
            padding: 8px;
            background: #f7fafc;
            border-radius: 6px;
            font-size: 12px;
        }

        .checkpoint-list.expanded {
            display: block;
        }

        .checkpoint-item {
            padding: 4px 0;
            border-bottom: 1px solid #e2e8f0;
        }

        .checkpoint-item:last-child {
            border-bottom: none;
        }

        .no-data {
            text-align: center;
            padding: 40px;
            color: #718096;
            font-size: 16px;
        }

        .refresh-info {
            color: #718096;
            font-size: 14px;
            margin-left: auto;
        }

        .auto-refresh-controls {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .auto-refresh-controls input[type="number"] {
            width: 80px;
        }

        .status-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 6px;
        }

        .status-indicator.active {
            background: #48bb78;
            box-shadow: 0 0 8px rgba(72, 187, 120, 0.6);
            animation: pulse 2s infinite;
        }

        .status-indicator.paused {
            background: #ed8936;
        }

        @keyframes pulse {

            0%,
            100% {
                opacity: 1;
            }

            50% {
                opacity: 0.5;
            }
        }
    </style>
</head>

<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Dédalo API Performance Monitor</h1>
            <p>Real-time performance metrics and request analysis</p>
        </div>

        <div class="stats-grid" id="statsGrid">
            <!-- Stats will be populated by JavaScript -->
        </div>

        <div class="controls">
            <div>
                <label for="filterDate">Date:</label>
                <input type="date" id="filterDate" value="">
            </div>
            <div>
                <label for="filterThreshold">Min Time (ms):</label>
                <input type="number" id="filterThreshold" value="0" min="0" step="100">
            </div>
            <div>
                <label for="filterAction">Action:</label>
                <select id="filterAction">
                    <option value="">All Actions</option>
                </select>
            </div>
            <button onclick="loadData()">🔄 Refresh</button>
            <button onclick="clearFilters()">✖ Clear Filters</button>
            <div class="auto-refresh-controls">
                <label for="autoRefreshInterval">Auto-refresh:</label>
                <input type="number" id="autoRefreshInterval" value="1" min="1" max="60" step="1">
                <span>seconds</span>
                <button id="toggleAutoRefresh" onclick="toggleAutoRefresh()">⏸ Pause</button>
            </div>
            <span class="refresh-info">
                <span class="status-indicator active" id="statusIndicator"></span>
                <span id="refreshInfo">Last updated: Never</span>
            </span>
        </div>

        <div class="requests-table">
            <table>
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>API / Action</th>
                        <th>Total Time</th>
                        <th>Memory</th>
                        <th>Status</th>
                        <th>Checkpoints</th>
                    </tr>
                </thead>
                <tbody id="requestsBody">
                    <tr>
                        <td colspan="6" class="no-data">Loading data...</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <script>
        let allRequests = [];
        let actions = new Set();
        let autoRefreshInterval = null;
        let isAutoRefreshActive = true;

        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            // Set today's date as default
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('filterDate').value = today;

            // Load data initially
            loadData();

            // Start auto-refresh
            startAutoRefresh();

            // Listen for interval changes
            document.getElementById('autoRefreshInterval').addEventListener('change', function() {
                if (isAutoRefreshActive) {
                    startAutoRefresh();
                }
            });
        });

        async function loadData() {
            try {
                const filterDate = document.getElementById('filterDate').value || new Date().toISOString().split('T')[0];
                const response = await fetch(`performance_viewer_api.php?date=${filterDate}`);
                const data = await response.json();

                if (data.result) {
                    allRequests = data.requests || [];
                    updateStats(data.stats);
                    updateActionsFilter();
                    applyFilters();

                    // Update refresh info
                    const now = new Date().toLocaleTimeString();
                    document.getElementById('refreshInfo').textContent = `Last updated: ${now}`;
                } else {
                    console.error('Error loading data:', data.msg);
                    showNoData('Error loading data');
                }
            } catch (error) {
                console.error('Error:', error);
                showNoData('Failed to load data');
            }
        }

        function updateStats(stats) {
            const statsGrid = document.getElementById('statsGrid');
            statsGrid.innerHTML = `
				<div class="stat-card">
					<div class="label">Total Requests</div>
					<div class="value">${stats.total_requests || 0}</div>
				</div>
				<div class="stat-card">
					<div class="label">Slow Requests</div>
					<div class="value">${stats.slow_requests || 0}<span class="unit">/ ${stats.total_requests || 0}</span></div>
				</div>
				<div class="stat-card">
					<div class="label">Avg Response Time</div>
					<div class="value">${stats.avg_time_ms || 0}<span class="unit">ms</span></div>
				</div>
				<div class="stat-card">
					<div class="label">Peak Memory</div>
					<div class="value">${stats.peak_memory_mb || 0}<span class="unit">MB</span></div>
				</div>
			`;
        }

        function updateActionsFilter() {
            actions.clear();
            allRequests.forEach(req => {
                if (req.request && req.request.action) {
                    actions.add(req.request.action);
                }
            });

            const filterAction = document.getElementById('filterAction');
            const currentValue = filterAction.value;
            filterAction.innerHTML = '<option value="">All Actions</option>';

            Array.from(actions).sort().forEach(action => {
                const option = document.createElement('option');
                option.value = action;
                option.textContent = action;
                if (action === currentValue) option.selected = true;
                filterAction.appendChild(option);
            });
        }

        function applyFilters() {
            const threshold = parseFloat(document.getElementById('filterThreshold').value) || 0;
            const action = document.getElementById('filterAction').value;

            let filtered = allRequests.filter(req => {
                if (req.total_time_ms < threshold) return false;
                if (action && req.request?.action !== action) return false;
                return true;
            });

            renderRequests(filtered);
        }

        function renderRequests(requests) {
            const tbody = document.getElementById('requestsBody');

            if (requests.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="no-data">No requests found</td></tr>';
                return;
            }

            tbody.innerHTML = requests.map((req, index) => {
                const timestamp = req.request?.timestamp || 'N/A';
                const ddApi = req.request?.dd_api || 'unknown';
                const action = req.request?.action || 'unknown';
                const totalTime = req.total_time_ms?.toFixed(2) || '0';
                const peakMemory = req.peak_memory_mb?.toFixed(2) || '0';
                const isSlow = req.is_slow;
                const hasErrors = req.response?.has_errors;

                let statusBadge = '';
                if (hasErrors) {
                    statusBadge = '<span class="badge badge-error">Error</span>';
                } else if (isSlow) {
                    statusBadge = '<span class="badge badge-slow">Slow</span>';
                } else {
                    statusBadge = '<span class="badge badge-normal">OK</span>';
                }

                let checkpointsHtml = '';
                if (req.checkpoints && req.checkpoints.length > 0) {
                    checkpointsHtml = `
						<div class="expandable" onclick="toggleCheckpoints(${index})">
							📊 ${req.checkpoints.length} checkpoints
							<div class="checkpoint-list" id="checkpoints-${index}">
								${req.checkpoints.map(cp => `
									<div class="checkpoint-item">
										<strong>${cp.name}</strong>: ${cp.elapsed_total_ms?.toFixed(2)}ms 
										(+${cp.elapsed_since_previous_ms?.toFixed(2)}ms) 
										| ${cp.memory_mb}MB
									</div>
								`).join('')}
							</div>
						</div>
					`;
                } else {
                    checkpointsHtml = '<span style="color: #a0aec0;">No checkpoints</span>';
                }

                return `
					<tr>
						<td>${timestamp}</td>
						<td><strong>${ddApi}</strong> → ${action}</td>
						<td><strong>${totalTime}</strong> ms</td>
						<td>${peakMemory} MB</td>
						<td>${statusBadge}</td>
						<td>${checkpointsHtml}</td>
					</tr>
				`;
            }).join('');
        }

        function toggleCheckpoints(index) {
            const element = document.getElementById(`checkpoints-${index}`);
            element.classList.toggle('expanded');
        }

        function clearFilters() {
            document.getElementById('filterThreshold').value = '0';
            document.getElementById('filterAction').value = '';
            applyFilters();
        }

        function showNoData(message) {
            const tbody = document.getElementById('requestsBody');
            tbody.innerHTML = `<tr><td colspan="6" class="no-data">${message}</td></tr>`;
        }

        function startAutoRefresh() {
            // Clear existing interval
            if (autoRefreshInterval) {
                clearInterval(autoRefreshInterval);
            }

            // Get interval in seconds and convert to milliseconds
            const intervalSeconds = parseInt(document.getElementById('autoRefreshInterval').value) || 1;
            const intervalMs = intervalSeconds * 1000;

            // Start new interval
            autoRefreshInterval = setInterval(loadData, intervalMs);
            isAutoRefreshActive = true;

            // Update UI
            document.getElementById('toggleAutoRefresh').textContent = '⏸ Pause';
            document.getElementById('statusIndicator').classList.add('active');
            document.getElementById('statusIndicator').classList.remove('paused');
        }

        function stopAutoRefresh() {
            if (autoRefreshInterval) {
                clearInterval(autoRefreshInterval);
                autoRefreshInterval = null;
            }
            isAutoRefreshActive = false;

            // Update UI
            document.getElementById('toggleAutoRefresh').textContent = '▶ Resume';
            document.getElementById('statusIndicator').classList.remove('active');
            document.getElementById('statusIndicator').classList.add('paused');
        }

        function toggleAutoRefresh() {
            if (isAutoRefreshActive) {
                stopAutoRefresh();
            } else {
                startAutoRefresh();
            }
        }

        // Add event listeners for filters
        document.getElementById('filterDate').addEventListener('change', loadData);
        document.getElementById('filterThreshold').addEventListener('input', applyFilters);
        document.getElementById('filterAction').addEventListener('change', applyFilters);
    </script>
</body>

</html>