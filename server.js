const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Hàm chuẩn hóa URL hình ảnh tương ứng theo từng nguồn
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

// API: Lấy danh sách phim (Hỗ trợ source=ophim hoặc source=phimapi)
app.get('/api/movies', async (req, res) => {
    try {
        const page = req.query.page || 1;
        const category = req.query.category || 'all';
        const source = req.query.source || 'ophim';
        
        let url = '';
        if (source === 'phimapi') {
            url = category === 'all' 
                ? `https://phimapi.com/v1/api/home?page=${page}`
                : `https://phimapi.com/v1/api/danh-sach/${category}?page=${page}`;
        } else {
            url = category === 'all' 
                ? `https://ophim1.com/v1/api/home?page=${page}`
                : `https://ophim1.com/v1/api/danh-sach/${category}?page=${page}`;
        }

        const response = await axios.get(url);
        const data = response.data;

        let items = source === 'phimapi' ? (data.items || data.data?.items || []) : (data.data?.items || []);
        let totalPages = source === 'phimapi' 
            ? (data.params?.pagination?.totalPages || data.data?.params?.pagination?.totalPages || 1)
            : (data.data?.params?.pagination?.totalPages || 1);

        items = items.map(item => ({
            ...item,
            thumb_url: normalizeImageUrl(item.thumb_url || item.poster_url, source),
            poster_url: normalizeImageUrl(item.poster_url || item.thumb_url, source),
            episode_current: normalizeEpisode(item)
        }));

        res.json({
            status: true,
            items: items,
            totalPages: totalPages
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
        const source = req.query.source || 'ophim';

        let url = source === 'phimapi'
            ? `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=20`
            : `https://ophim1.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=20`;
        
        const response = await axios.get(url);
        const data = response.data;

        let items = source === 'phimapi' ? (data.items || data.data?.items || []) : (data.data?.items || []);
        items = items.map(item => ({
            ...item,
            thumb_url: normalizeImageUrl(item.thumb_url || item.poster_url, source),
            poster_url: normalizeImageUrl(item.poster_url || item.thumb_url, source),
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

// API: Lấy chi tiết phim
app.get('/api/movie/:slug', async (req, res) => {
    try {
        const slug = req.params.slug;
        const source = req.query.source || 'ophim';

        let url = source === 'phimapi'
            ? `https://phimapi.com/phim/${slug}`
            : `https://ophim1.com/v1/api/phim/${slug}`;

        const response = await axios.get(url);
        const data = response.data;

        if (!data.status && !data.movie) {
            return res.status(404).json({ status: false, message: "Không tìm thấy phim" });
        }

        let movie = source === 'phimapi' ? (data.movie || data.data?.item) : data.data?.item;
        let servers = source === 'phimapi' ? (data.episodes || data.data?.episodes || []) : (data.data?.episodes || data.data?.item?.episodes || []);

        if (movie) {
            movie.thumb_url = normalizeImageUrl(movie.thumb_url || movie.poster_url, source);
            movie.poster_url = normalizeImageUrl(movie.poster_url || movie.thumb_url, source);
        }

        res.json({
            status: true,
            movie: movie,
            servers: servers
        });
    } catch (error) {
        console.error("Lỗi chi tiết phim:", error.message);
        res.status(500).json({ status: false, message: "Lỗi tải chi tiết phim" });
    }
});

app.listen(PORT, () => {
    console.log(`Huy Cinema Server đang chạy tại: http://localhost:${PORT}`);
});
