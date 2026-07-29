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

// Hàm chuẩn hóa URL hình ảnh chuẩn xác cho từng nguồn
function normalizeImageUrl(url, source = 'ophim') {
    if (!url) return 'https://placehold.co/300x400/121218/ffffff?text=No+Image';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;

    if (source === 'phimapi') {
        if (url.startsWith('/')) return `https://img.phimapi.com${url}`;
        if (url.startsWith('uploads/')) return `https://img.phimapi.com/${url}`;
        return `https://img.phimapi.com/uploads/movies/${url}`;
    }

    // Mặc định cho Ophim
    if (url.startsWith('/')) return `https://img.ophim.live${url}`;
    if (url.startsWith('uploads/')) return `https://img.ophim.live/${url}`;
    return `https://img.ophim.live/uploads/movies/${url}`;
}

// API: Lấy danh sách phim (Trang chủ & Danh mục - Kết hợp PhimAPI + Ophim)
app.get('/api/movies', async (req, res) => {
    try {
        const page = req.query.page || 1;
        const category = req.query.category || 'all';
        
        const ophimUrl = category === 'all' 
            ? `https://ophim1.com/v1/api/home?page=${page}`
            : `https://ophim1.com/v1/api/danh-sach/${category}?page=${page}`;

        const phimapiUrl = category === 'all'
            ? `https://phimapi.com/v1/api/home?page=${page}`
            : `https://phimapi.com/v1/api/danh-sach/${category}?page=${page}`;

        const [ophimRes, phimapiRes] = await Promise.allSettled([
            axios.get(ophimUrl),
            axios.get(phimapiUrl)
        ]);

        const movieMap = new Map();
        let totalPages = 1;

        // 1. Lấy từ PhimAPI trước (để có phim mới cập nhật nhanh)
        if (phimapiRes.status === 'fulfilled') {
            const data = phimapiRes.value.data;
            const items = data.items || data.data?.items || [];
            totalPages = data.params?.pagination?.totalPages || data.data?.params?.pagination?.totalPages || 1;
            
            items.forEach(item => {
                const slug = item.slug;
                if (slug) {
                    const rawImg = item.thumb_url || item.poster_url || '';
                    movieMap.set(slug, {
                        ...item,
                        thumb_url: normalizeImageUrl(rawImg, 'phimapi'),
                        poster_url: normalizeImageUrl(rawImg, 'phimapi'),
                        episode_current: normalizeEpisode(item.episode_current)
                    });
                }
            });
        }

        // 2. Lấy từ Ophim sau và ghi đè (Ưu tiên ảnh đẹp và thông tin chuẩn của Ophim cho các phim trùng)
        if (ophimRes.status === 'fulfilled') {
            const data = ophimRes.value.data;
            const items = data.data?.items || [];
            const ophimTotalPages = data.data?.params?.pagination?.totalPages;
            if (ophimTotalPages) totalPages = ophimTotalPages;

            items.forEach(item => {
                const slug = item.slug;
                if (slug) {
                    const rawImg = item.thumb_url || item.poster_url || '';
                    movieMap.set(slug, {
                        ...item,
                        thumb_url: normalizeImageUrl(rawImg, 'ophim'),
                        poster_url: normalizeImageUrl(rawImg, 'ophim'),
                        episode_current: normalizeEpisode(item.episode_current)
                    });
                }
            });
        }

        res.json({
            status: true,
            items: Array.from(movieMap.values()),
            totalPages: totalPages
        });
    } catch (error) {
        console.error("Lỗi lấy danh sách phim:", error.message);
        res.status(500).json({ status: false, message: "Lỗi kết nối tới máy chủ phim" });
    }
});

// API: Tìm kiếm (Kết hợp cả 2 nguồn, chuẩn hóa ảnh độc lập)
app.get('/api/search', async (req, res) => {
    try {
        const keyword = req.query.keyword || '';
        const searchUrl = encodeURIComponent(keyword);

        const [ophimRes, phimapiRes] = await Promise.allSettled([
            axios.get(`https://ophim1.com/v1/api/tim-kiem?keyword=${searchUrl}&limit=20`),
            axios.get(`https://phimapi.com/v1/api/tim-kiem?keyword=${searchUrl}&limit=20`)
        ]);

        const movieMap = new Map();

        // 1. Tìm từ PhimAPI trước
        if (phimapiRes.status === 'fulfilled') {
            const data = phimapiRes.value.data;
            const items = data.items || data.data?.items || [];
            items.forEach(item => {
                const slug = item.slug;
                if (slug) {
                    const rawImg = item.thumb_url || item.poster_url || '';
                    movieMap.set(slug, {
                        ...item,
                        thumb_url: normalizeImageUrl(rawImg, 'phimapi'),
                        poster_url: normalizeImageUrl(rawImg, 'phimapi'),
                        episode_current: normalizeEpisode(item.episode_current)
                    });
                }
            });
        }

        // 2. Tìm từ Ophim sau và ghi đè
        if (ophimRes.status === 'fulfilled') {
            const data = ophimRes.value.data;
            const items = data.data?.items || [];
            items.forEach(item => {
                const slug = item.slug;
                if (slug) {
                    const rawImg = item.thumb_url || item.poster_url || '';
                    movieMap.set(slug, {
                        ...item,
                        thumb_url: normalizeImageUrl(rawImg, 'ophim'),
                        poster_url: normalizeImageUrl(rawImg, 'ophim'),
                        episode_current: normalizeEpisode(item.episode_current)
                    });
                }
            });
        }

        res.json({
            status: true,
            items: Array.from(movieMap.values())
        });
    } catch (error) {
        console.error("Lỗi tìm kiếm phim:", error.message);
        res.status(500).json({ status: false, message: "Lỗi tìm kiếm" });
    }
});

// API: Chi tiết phim (Ưu tiên ảnh/thông tin Ophim + Gộp chung Server từ cả 2 nguồn)
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

        // 1. Lấy dữ liệu từ Ophim
        if (ophimRes.status === 'fulfilled' && ophimRes.value.data.status) {
            const ophimData = ophimRes.value.data;
            movie = ophimData.data.item;
            if (movie) {
                hasOphim = true;
                const rawImg = movie.thumb_url || movie.poster_url || '';
                movie.thumb_url = normalizeImageUrl(rawImg, 'ophim');
                movie.poster_url = normalizeImageUrl(rawImg, 'ophim');
            }
            const ophimServers = ophimData.data.episodes || ophimData.data.item?.episodes || [];
            ophimServers.forEach((srv, idx) => {
                combinedServers.push({
                    server_name: `Ophim - ${srv.server_name || srv.name || `Server #${idx + 1}`}`,
                    server_data: srv.server_data || srv.items || srv
                });
            });
        }

        // 2. Lấy dữ liệu từ PhimAPI (Gộp server và làm fallback nếu Ophim chưa có phim)
        if (phimapiRes.status === 'fulfilled' && (phimapiRes.value.data.status || phimapiRes.value.data.movie)) {
            const phimapiData = phimapiRes.value.data;
            
            if (!hasOphim) {
                movie = phimapiData.movie || phimapiData.data?.item;
                if (movie) {
                    const rawImg = movie.thumb_url || movie.poster_url || '';
                    movie.thumb_url = normalizeImageUrl(rawImg, 'phimapi');
                    movie.poster_url = normalizeImageUrl(rawImg, 'phimapi');
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
