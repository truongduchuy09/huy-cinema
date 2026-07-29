const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Hàm chuẩn hóa chuỗi tập phim
function normalizeEpisode(epText) {
    if (!epText) return 'Full';
    let clean = epText.replace(/tập\s*/gi, '').trim();
    if (!clean || clean.toLowerCase() === 'full') return 'Full';
    return `Tập ${clean}`;
}

// Hàm chuẩn hóa URL hình ảnh (Ophim vs PhimAPI)
function normalizeImageUrl(url, source = 'ophim') {
    if (!url) return 'https://placehold.co/300x400/121218/ffffff?text=No+Image';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (source === 'phimapi') {
        return `https://phimapi.com/${url}`;
    }
    if (url.startsWith('/')) return `https://img.ophim.live${url}`;
    return `https://img.ophim.live/uploads/movies/${url}`;
}

// API: Lấy danh sách phim (Trang chủ & Danh mục)
app.get('/api/movies', async (req, res) => {
    try {
        const page = req.query.page || 1;
        const category = req.query.category || 'all';
        
        let url = `https://ophim1.com/v1/api/danh-sach/${category}?page=${page}`;
        if (category === 'all') {
            url = `https://ophim1.com/v1/api/home?page=${page}`;
        }

        const response = await axios.get(url);
        const data = response.data;

        let items = data.data?.items || [];
        items = items.map(item => ({
            ...item,
            thumb_url: normalizeImageUrl(item.thumb_url || item.poster_url, 'ophim'),
            poster_url: normalizeImageUrl(item.poster_url || item.thumb_url, 'ophim'),
            episode_current: normalizeEpisode(item.episode_current)
        }));

        res.json({
            status: true,
            items: items,
            totalPages: data.data?.params?.pagination?.totalPages || 1
        });
    } catch (error) {
        console.error("Lỗi lấy danh sách phim:", error.message);
        res.status(500).json({ status: false, message: "Lỗi kết nối tới máy chủ phim" });
    }
});

// API: Tìm kiếm (Ưu tiên Ophim trước, nếu không có mới dùng PhimAPI)
app.get('/api/search', async (req, res) => {
    try {
        const keyword = req.query.keyword || '';
        
        // 1. Thử tìm bên Ophim trước
        const ophimUrl = `https://ophim1.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=20`;
        const ophimRes = await axios.get(ophimUrl);
        let items = ophimRes.data.data?.items || [];

        if (items.length > 0) {
            items = items.map(item => ({
                ...item,
                thumb_url: normalizeImageUrl(item.thumb_url || item.poster_url, 'ophim'),
                poster_url: normalizeImageUrl(item.poster_url || item.thumb_url, 'ophim'),
                episode_current: normalizeEpisode(item.episode_current)
            }));
            return res.json({ status: true, items: items });
        }

        // 2. Nếu Ophim không có, tìm sang PhimAPI
        const phimapiUrl = `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=20`;
        const phimapiRes = await axios.get(phimapiUrl);
        items = phimapiRes.data.items || phimapiRes.data.data?.items || [];

        items = items.map(item => ({
            ...item,
            thumb_url: normalizeImageUrl(item.thumb_url || item.poster_url, 'phimapi'),
            poster_url: normalizeImageUrl(item.poster_url || item.thumb_url, 'phimapi'),
            episode_current: normalizeEpisode(item.episode_current)
        }));

        res.json({ status: true, items: items });
    } catch (error) {
        console.error("Lỗi tìm kiếm phim:", error.message);
        res.status(500).json({ status: false, message: "Lỗi tìm kiếm" });
    }
});

// API: Chi tiết phim (Ưu tiên thông tin/ảnh Ophim + Gộp chung Server từ cả 2 nguồn)
app.get('/api/movie/:slug', async (req, res) => {
    try {
        const slug = req.params.slug;

        const [ophimRes, phimapiRes] = await Promise.allSettled([
            axios.get(`https://ophim1.com/v1/api/phim/${slug}`),
            axios.get(`https://phimapi.com/phim/${slug}`)
        ]);

        let movie = null;
        let combinedServers = [];
        let hasOphim = false;

        // 1. Xử lý dữ liệu từ Ophim
        if (ophimRes.status === 'fulfilled' && ophimRes.value.data.status) {
            const ophimData = ophimRes.value.data;
            movie = ophimData.data.item;
            if (movie) {
                hasOphim = true;
                movie.thumb_url = normalizeImageUrl(movie.thumb_url || movie.poster_url, 'ophim');
                movie.poster_url = normalizeImageUrl(movie.poster_url || movie.thumb_url, 'ophim');
            }
            const ophimServers = ophimData.data.episodes || ophimData.data.item?.episodes || [];
            ophimServers.forEach((srv, idx) => {
                combinedServers.push({
                    server_name: `Ophim - ${srv.server_name || srv.name || `Server #${idx + 1}`}`,
                    server_data: srv.server_data || srv.items || srv
                });
            });
        }

        // 2. Xử lý dữ liệu từ PhimAPI (Gộp server và làm fallback nếu Ophim thiếu)
        if (phimapiRes.status === 'fulfilled' && (phimapiRes.value.data.status || phimapiRes.value.data.movie)) {
            const phimapiData = phimapiRes.value.data;
            
            if (!hasOphim) {
                movie = phimapiData.movie || phimapiData.data?.item;
                if (movie) {
                    movie.thumb_url = normalizeImageUrl(movie.thumb_url || movie.poster_url, 'phimapi');
                    movie.poster_url = normalizeImageUrl(movie.poster_url || movie.thumb_url, 'phimapi');
                }
            }

            const phimapiServers = phimapiData.episodes || phimapiData.data?.episodes || [];
            phimapiServers.forEach((srv, idx) => {
                combinedServers.push({
                    server_name: `PhimAPI - ${srv.server_name || srv.name || `Server #${idx + 1}`}`,
                    server_data: srv.server_data || srv.items || srv
                });
            });
        }

        if (!movie && combinedServers.length === 0) {
            return res.status(404).json({ status: false, message: "Không tìm thấy phim ở cả 2 nguồn" });
        }

        res.json({
            status: true,
            movie: movie,
            servers: combinedServers
        });
    } catch (error) {
        console.error("Lỗi chi tiết phim:", error.message);
        res.status(500).json({ status: false, message: "Lỗi tải chi tiết phim" });
    }
});

// Khởi động server
app.listen(PORT, () => {
    console.log(`Huy Cinema Server đang chạy tại: http://localhost:${PORT}`);
});
