const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Hàm chuẩn hóa URL hình ảnh
function normalizeImageUrl(url, source = 'ophim') {
    if (!url) return 'https://placehold.co/300x400/121218/ffffff?text=No+Image';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (source === 'phimapi') {
        return `https://phimapi.com/${url}`;
    }
    if (url.startsWith('/')) return `https://img.ophim.live${url}`;
    return `https://img.ophim.live/uploads/movies/${url}`;
}

// Hàm chuẩn hóa thông minh: Ongoing -> Tập X/Y | Completed -> Hoàn tất
function normalizeEpisode(item) {
    const current = (item.episode_current || '').trim();
    const total = (item.episode_total || '').trim();
    
    const lowerCurrent = current.toLowerCase();
    const lowerTotal = total.toLowerCase();

    if (
        lowerCurrent.includes('full') ||
        lowerCurrent.includes('hoàn tất') ||
        lowerCurrent.includes('trọn bộ') ||
        lowerTotal.includes('full') ||
        lowerTotal.includes('hoàn tất')
    ) {
        return 'Hoàn tất';
    }

    if (current.includes('/')) {
        const parts = current.split('/');
        if (parts.length === 2 && parts[0].trim() === parts[1].trim() && /\d+/.test(parts[0])) {
            return 'Hoàn tất';
        }
    }

    let currentNum = current.replace(/\D/g, '');
    let totalNum = total.replace(/\D/g, '');

    if (currentNum && totalNum) {
        if (currentNum === totalNum) {
            return 'Hoàn tất';
        }
        return `Tập ${currentNum}/${totalNum}`;
    } else if (currentNum) {
        return `Tập ${currentNum}`;
    }
    
    return current ? (lowerCurrent.startsWith('tập') ? current : `Tập ${current}`) : 'Hoàn tất';
}

// API: Lấy danh sách phim (Mặc định dùng Ophim cho trang chủ/danh sách)
app.get('/api/movies', async (req, res) => {
    try {
        const page = req.query.page || 1;
        const category = req.query.category || 'all';
        
        let url = category === 'all' 
            ? `https://ophim1.com/v1/api/home?page=${page}`
            : `https://ophim1.com/v1/api/danh-sach/${category}?page=${page}`;

        const response = await axios.get(url);
        const data = response.data;

        let items = data.data?.items || [];
        items = items.map(item => ({
            ...item,
            thumb_url: normalizeImageUrl(item.thumb_url || item.poster_url, 'ophim'),
            poster_url: normalizeImageUrl(item.poster_url || item.thumb_url, 'ophim'),
            episode_current: normalizeEpisode(item)
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

// API: Tìm kiếm phim
app.get('/api/search', async (req, res) => {
    try {
        const keyword = req.query.keyword || '';
        const url = `https://ophim1.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=20`;
        
        const response = await axios.get(url);
        const data = response.data;

        let items = data.data?.items || [];
        items = items.map(item => ({
            ...item,
            thumb_url: normalizeImageUrl(item.thumb_url || item.poster_url, 'ophim'),
            poster_url: normalizeImageUrl(item.poster_url || item.thumb_url, 'ophim'),
            episode_current: normalizeEpisode(item)
        }));

        res.json({
            status: true,
            items: items
        });
    } catch (error) {
        console.error("Lỗi tìm kiếm phim:", error.message);
        res.status(500).json({ status: false, message: "Lỗi tìm kiếm" });
    }
});

// API: Lấy chi tiết phim - Tự động gộp server từ cả Ophim và PhimAPI
app.get('/api/movie/:slug', async (req, res) => {
    try {
        const slug = req.params.slug;

        // Gọi đồng thời cả 2 API Ophim và PhimAPI cùng lúc
        const [ophimRes, phimapiRes] = await Promise.allSettled([
            axios.get(`https://ophim1.com/v1/api/phim/${slug}`),
            axios.get(`https://phimapi.com/phim/${slug}`)
        ]);

        let movie = null;
        let combinedServers = [];

        // 1. Lấy dữ liệu từ Ophim
        if (ophimRes.status === 'fulfilled' && ophimRes.value.data.status) {
            const ophimData = ophimRes.value.data;
            movie = ophimData.data.item;
            if (movie) {
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

        // 2. Lấy dữ liệu từ PhimAPI
        if (phimapiRes.status === 'fulfilled' && (phimapiRes.value.data.status || phimapiRes.value.data.movie)) {
            const phimapiData = phimapiRes.value.data;
            if (!movie) {
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
        console.error("Lỗi chi tiết phim đa nguồn:", error.message);
        res.status(500).json({ status: false, message: "Lỗi tải chi tiết phim" });
    }
});

app.listen(PORT, () => {
    console.log(`Huy Cinema Server đang chạy tại: http://localhost:${PORT}`);
});
