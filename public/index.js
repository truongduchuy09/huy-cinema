<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Huy Cinema - Multi Source & Resume Progress</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <style>
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
    </style>
</head>
<body class="bg-gray-900 text-white font-sans">

    <header class="bg-gray-800 sticky top-0 z-50 p-4 shadow-lg">
        <div class="container mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <h1 class="text-2xl font-bold text-red-500 cursor-pointer select-none hover:opacity-80 transition" onclick="goHome()">Huy Cinema</h1>
            
            <div class="flex flex-wrap justify-center gap-2">
                <button onclick="setCategory('all')" id="cat-all" class="cat-btn bg-red-600 px-3 py-1.5 text-xs font-bold rounded-full transition">Tất Cả Phim</button>
                <button onclick="setCategory('hoat-hinh')" id="cat-hoat-hinh" class="cat-btn bg-gray-700 hover:bg-gray-600 px-3 py-1.5 text-xs font-bold rounded-full transition">Anime / Hoạt Hình</button>
                <button onclick="setCategory('phim-bo')" id="cat-phim-bo" class="cat-btn bg-gray-700 hover:bg-gray-600 px-3 py-1.5 text-xs font-bold rounded-full transition">Phim Bộ</button>
                <button onclick="setCategory('phim-le')" id="cat-phim-le" class="cat-btn bg-gray-700 hover:bg-gray-600 px-3 py-1.5 text-xs font-bold rounded-full transition">Phim Lẻ</button>
            </div>
        </div>
    </header>

    <main class="container mx-auto px-4 py-8">
        <section id="playerSection" class="hidden mb-12 bg-gray-800 p-4 rounded-lg shadow-xl">
            <div class="flex justify-between items-center mb-4">
                <h2 id="playingTitle" class="text-lg md:text-xl font-bold text-yellow-400">Đang tải phim...</h2>
                <button onclick="closePlayer()" class="text-gray-400 hover:text-white text-sm bg-gray-700 px-3 py-1 rounded">Đóng [X]</button>
            </div>

            <div class="aspect-video w-full max-w-4xl mx-auto bg-black rounded overflow-hidden shadow-2xl">
                <video id="videoPlayer" controls class="w-full h-full"></video>
            </div>

            <div class="mt-6 border-t border-gray-700 pt-4">
                <h3 class="font-semibold text-gray-300 text-sm mb-2">Chọn Nguồn Phim:</h3>
                <div id="serverList" class="flex flex-wrap gap-2 mb-4"></div>

                <h3 class="font-semibold text-gray-300 text-sm mb-2">Chọn Tập Phim:</h3>
                <div id="episodeList" class="flex flex-wrap gap-2"></div>
            </div>
        </section>

        <section id="historySection" class="hidden mb-10">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-lg font-semibold border-l-4 border-blue-500 pl-2">Tiếp Tục Xem</h2>
                <button onclick="clearHistory()" class="text-xs text-gray-400 hover:text-red-500 transition">[Xóa lịch sử]</button>
            </div>
            <div id="historyGrid" class="flex overflow-x-auto gap-4 pb-2 scrollbar-hide snap-x"></div>
        </section>

        <h2 id="sectionTitle" class="text-xl font-semibold mb-6 border-l-4 border-red-500 pl-2">Phim Mới Cập Nhật</h2>

        <div id="movieGrid" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6"></div>

        <div id="pagination" class="flex justify-center gap-4 mt-12">
            <button id="prevBtn" onclick="changePage(-1)" class="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded disabled:opacity-30 disabled:cursor-not-allowed transition">Trang trước</button>
            <span id="pageCurrent" class="self-center font-medium bg-gray-800 px-4 py-2 rounded border border-gray-700">Trang 1 / 1</span>
            <button id="nextBtn" onclick="changePage(1)" class="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded disabled:opacity-30 disabled:cursor-not-allowed transition">Trang sau</button>
        </div>
    </main>

    <script>
        let currentPage = 1;
        let currentCategory = 'all';
        let hls = null;
        let currentMovieData = null;
        let activeServerIndex = 0;
        let currentPlaying = null;
        let saveTimeout = null;

        function goHome() {
            setCategory('all');
        }

        function setCategory(cat) {
            currentCategory = cat;
            document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.replace('bg-red-600', 'bg-gray-700'));
            document.getElementById(`cat-${cat}`).classList.replace('bg-gray-700', 'bg-red-600');
            closePlayer();
            loadMovies(1);
        }

        async function loadMovies(page) {
            currentPage = page;
            document.getElementById('pageCurrent').innerText = `Trang ${currentPage}`;

            if (page === 1) renderHistory();
            else document.getElementById('historySection').classList.add('hidden');

            try {
                const res = await fetch(`/api/movies?page=${page}&category=${currentCategory}`);
                const data = await res.json();
                
                renderMovies(data.items || []);
                window.scrollTo({ top: 0, behavior: 'smooth' });
                document.getElementById('prevBtn').disabled = (currentPage === 1);
            } catch (err) {
                console.error("Lỗi lấy danh sách phim:", err);
            }
        }

        function renderMovies(movies) {
            const grid = document.getElementById('movieGrid');
            grid.innerHTML = "";

            if (!movies || movies.length === 0) {
                grid.innerHTML = `<p class="col-span-full text-center text-gray-400">Không tìm thấy bộ phim nào.</p>`;
                return;
            }

            movies.forEach(movie => {
                const card = document.createElement('div');
                card.className = "bg-gray-800 rounded-lg overflow-hidden shadow-md hover:scale-105 transition duration-300 cursor-pointer group";
                card.onclick = () => watchMovie(movie.slug);

                card.innerHTML = `
                    <div class="relative aspect-[3/4] bg-gray-700">
                        <img src="${movie.thumb_url}" alt="${movie.name}" class="w-full h-full object-cover" loading="lazy" onerror="this.onerror=null; this.src='https://placehold.co/300x400/1f2937/ffffff?text=No+Image'">
                        <span class="absolute top-2 left-2 bg-red-600 text-xs px-2 py-1 rounded font-bold shadow-md z-10">${movie.episode_current || 'Full'}</span>
                        <span class="absolute top-2 right-2 bg-blue-600/90 text-[10px] px-1.5 py-0.5 rounded font-bold text-white shadow-md z-10">${movie.source}</span>
                    </div>
                    <div class="p-3">
                        <h3 class="font-semibold text-sm line-clamp-1 group-hover:text-red-400 transition">${movie.name}</h3>
                        <p class="text-xs text-gray-400 mt-1">${movie.origin_name || ''} (${movie.year || 'N/A'})</p>
                    </div>
                `;
                grid.appendChild(card);
            });
        }

        async function watchMovie(slug, autoEpName = null) {
            try {
                const res = await fetch(`/api/movie/${slug}`);
                const data = await res.json();

                if (!data.status || !data.servers || data.servers.length === 0) {
                    return alert("Phim này hiện đang bảo trì link phát!");
                }

                currentMovieData = data;
                activeServerIndex = 0;

                const playerSection = document.getElementById('playerSection');
                playerSection.classList.remove('hidden');
                playerSection.scrollIntoView({ behavior: 'smooth' });

                renderServerButtons(autoEpName);

            } catch (err) {
                console.error("Lỗi lấy chi tiết phim:", err);
            }
        }

        function renderServerButtons(autoEpName = null) {
            const serverList = document.getElementById('serverList');
            serverList.innerHTML = "";

            currentMovieData.servers.forEach((srv, idx) => {
                const btn = document.createElement('button');
                btn.className = `${idx === activeServerIndex ? 'bg-blue-600 font-bold' : 'bg-gray-700'} hover:bg-blue-600 text-white px-3 py-1.5 text-xs rounded transition`;
                btn.innerText = srv.server_name;
                
                btn.onclick = () => {
                    const video = document.getElementById('videoPlayer');
                    if (currentPlaying && video.duration > 0) {
                        saveHistoryItem(currentPlaying, video.currentTime, video.duration);
                    }
                    
                    const currentEp = currentPlaying?.epName || autoEpName;
                    activeServerIndex = idx;
                    renderServerButtons(currentEp);
                };
                serverList.appendChild(btn);
            });

            const currentEpToPlay = currentPlaying?.epName || autoEpName;
            renderEpisodes(currentMovieData.servers[activeServerIndex].server_data, currentEpToPlay);
        }

        function renderEpisodes(episodes, autoEpName = null) {
            const epContainer = document.getElementById('episodeList');
            epContainer.innerHTML = "";

            let targetEp = episodes[0];

            episodes.forEach(ep => {
                const btn = document.createElement('button');
                const isTarget = autoEpName ? (ep.name === autoEpName) : false;

                btn.className = `${isTarget ? 'bg-red-600 font-bold' : 'bg-gray-700'} hover:bg-red-600 text-white px-3 py-1.5 text-xs rounded transition min-w-[45px] ep-btn`;
                btn.innerText = ep.name;
                btn.onclick = () => {
                    const video = document.getElementById('videoPlayer');
                    if (currentPlaying && video.duration > 0) {
                        saveHistoryItem(currentPlaying, video.currentTime, video.duration);
                    }
                    document.querySelectorAll('.ep-btn').forEach(b => b.classList.replace('bg-red-600', 'bg-gray-700'));
                    btn.classList.replace('bg-gray-700', 'bg-red-600');
                    playVideo(ep.link_m3u8, ep.name, currentMovieData.movie);
                };

                epContainer.appendChild(btn);
                if (isTarget) targetEp = ep;
            });

            playVideo(targetEp.link_m3u8, targetEp.name, currentMovieData.movie);
        }

        function playVideo(url, epName, movie) {
            const video = document.getElementById('videoPlayer');

            currentPlaying = {
                slug: movie.slug,
                name: movie.name,
                thumb_url: movie.thumb_url || movie.poster_url,
                epName: epName,
                url: url
            };

            document.getElementById('playingTitle').innerText = `${movie.name} - Tập ${epName}`;

            const history = getHistory();
            const savedItem = history.find(h => h.slug === movie.slug && h.epName === epName);
            const savedTime = savedItem ? savedItem.position : 0;

            if (hls) hls.destroy();

            if (Hls.isSupported()) {
                hls = new Hls();
                hls.loadSource(url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    if (savedTime > 3) video.currentTime = savedTime;
                    video.play();
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                video.addEventListener('loadedmetadata', () => {
                    if (savedTime > 3) video.currentTime = savedTime;
                    video.play();
                }, { once: true });
            }
        }

        function getHistory() { return JSON.parse(localStorage.getItem('huy_cinema_history')) || []; }

        function saveHistoryItem(movie, position, duration) {
            if (!movie || duration === 0) return;
            let history = getHistory().filter(h => !(h.slug === movie.slug && h.epName === movie.epName));
            history.unshift({
                ...movie,
                position: position,
                duration: duration,
                timeText: formatTime(position)
            });
            if (history.length > 15) history.pop();
            localStorage.setItem('huy_cinema_history', JSON.stringify(history));
        }

        function renderHistory() {
            const historySection = document.getElementById('historySection');
            const historyGrid = document.getElementById('historyGrid');
            const history = getHistory();

            if (history.length === 0) return historySection.classList.add('hidden');

            historySection.classList.remove('hidden');
            historyGrid.innerHTML = "";

            history.forEach(item => {
                const percent = (item.position / item.duration) * 100 || 0;
                const card = document.createElement('div');
                card.className = "bg-gray-800 rounded-lg overflow-hidden shadow-md cursor-pointer flex-shrink-0 w-36 snap-start";
                card.onclick = () => watchMovie(item.slug, item.epName);

                card.innerHTML = `
                    <div class="relative aspect-[3/4] bg-gray-700">
                        <img src="${item.thumb_url}" class="w-full h-full object-cover">
                        <span class="absolute top-2 left-2 bg-blue-600 text-[10px] px-1.5 py-0.5 rounded font-bold">Tập ${item.epName}</span>
                        <div class="absolute bottom-0 left-0 w-full h-1 bg-gray-600">
                            <div class="bg-red-500 h-full" style="width: ${percent}%"></div>
                        </div>
                    </div>
                    <div class="p-2">
                        <h3 class="font-semibold text-xs line-clamp-1">${item.name}</h3>
                        <p class="text-[10px] text-gray-400 mt-0.5">Dừng ở: ${item.timeText}</p>
                    </div>
                `;
                historyGrid.appendChild(card);
            });
        }

        function clearHistory() {
            localStorage.removeItem('huy_cinema_history');
            renderHistory();
        }

        function formatTime(s) {
            let m = Math.floor(s / 60), sec = Math.floor(s % 60);
            return `${m < 10 ? '0' : ''}${m}:${sec < 10 ? '0' : ''}${sec}`;
        }

        function closePlayer() {
            const video = document.getElementById('videoPlayer');
            if (currentPlaying && video.duration > 0) saveHistoryItem(currentPlaying, video.currentTime, video.duration);
            video.pause();
            if (hls) hls.destroy();
            document.getElementById('playerSection').classList.add('hidden');
            if (currentPage === 1) renderHistory();
        }

        function changePage(step) {
            if (currentPage + step < 1) return;
            loadMovies(currentPage + step);
        }

        document.getElementById('videoPlayer').addEventListener('timeupdate', () => {
            const v = document.getElementById('videoPlayer');
            if (currentPlaying && v.duration > 0 && !saveTimeout) {
                saveTimeout = setTimeout(() => {
                    saveHistoryItem(currentPlaying, v.currentTime, v.duration);
                    saveTimeout = null;
                }, 3000);
            }
        });

        loadMovies(1);
    </script>
</body>
</html>
