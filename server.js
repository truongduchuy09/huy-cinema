const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- HÀM BỔ TRỢ CHUẨN HÓA DỮ LIỆU ---

function fixImageUrl(rawUrl, pathImage = "https://ophimimg.com/uploads/movies/") {
    if (!rawUrl) return 'https://placehold.co/300x400/1f2937/ffffff?text=No+Image';
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        return rawUrl;
    }
    const cleanPath = rawUrl.replace(/^\/+/, '');
    const base = pathImage.endsWith('/') ? pathImage : `${pathImage}/`;
    return `${base}${cleanPath}`;
}

function fixEpisodeStatus(current, total) {
    if (!current) return "Cập nhật";
    let cleanCurrent = String(current).trim();
    let cleanTotal = String(total || '').toLowerCase().replace(/tập/g, '').trim();

    if (cleanCurrent.toLowerCase().includes("hoàn") || cleanCurrent.toLowerCase().includes("full")) {
        return "Hoàn Tất";
    }
    if (!cleanCurrent.includes("/") && cleanTotal && cleanTotal !== "??") {
        return `${cleanCurrent}/${cleanTotal}`;
    }
    return cleanCurrent;
}

// --- API ROUTES ---

// Lấy danh sách phim (Hỗ trợ lọc theo danh mục: all, phim-bo, phim-le, hoat-hinh, tv-shows)
app.get('/api/movies', async (req, res) => {
    try {
        const page = req.query.page || 1;
        const category = req.query.category || 'all'; 

        let url = '';
        if (category === 'all') {
            url = `https://ophim1.com/danh-sach/phim-moi-cap-nhat?page=${page}`;
        } else {
            url = `https://ophim1.com/v1/api/danh-sach/${category}?page=${page}`;
        }

        const response = await axios.get(url);
        const data = response.data;

        let rawItems = [];
        let pathImage = "https://ophimimg.com/uploads/movies/";
        let totalItems = 0;
        let totalItemsPerPage = 10;

        if (category === 'all') {
            rawItems = data.items || [];
            pathImage = data.pathImage || pathImage;
            const pagination = data.pagination || {};
            totalItems = pagination.totalItems || 0;
            totalItemsPerPage = pagination.totalItemsPerPage || 10;
        } else {
            const resData = data.data || {};
            rawItems = resData.items || [];
            pathImage = resData.APP_DOMAIN_CDN_IMAGE || pathImage;
            const pagination = resData.params?.pagination || {};
            totalItems = pagination.totalItems || 0;
            totalItemsPerPage = pagination.totalItemsPerPage || 10;
        }

        const totalPages = totalItems ? Math.ceil(totalItems / totalItemsPerPage) : 1;

        const items = rawItems.map(item => ({
            slug: item.slug,
            name: item.name,
            origin_name: item.origin_name,
            year: item.year,
            lang: item.lang || 'Vietsub',
            thumb_url: fixImageUrl(item.thumb_url || item.poster_url, pathImage),
            episode_current: fixEpisodeStatus(item.episode_current, item.episode_total)
        }));

        res.json({
            status: true,
            currentPage: Number(page),
            totalPages: totalPages,
            items: items
        });
    } catch (error) {
        console.error("Lỗi /api/movies:", error.message);
        res.status(500).json({ status: false, message: "Lỗi khi kết nối nguồn phim" });
    }
});

// Chi tiết phim
app.get('/api/movie/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const response = await axios.get(`https://ophim1.com/phim/${slug}`);
        const data = response.data;

        if (!data.status || !data.movie) {
            return res.status(404).json({ status: false, message: "Không tìm thấy phim" });
        }

        const movie = data.movie;
        const pathImage = data.pathImage || "https://ophimimg.com/uploads/movies/";
        movie.thumb_url = fixImageUrl(movie.thumb_url || movie.poster_url, pathImage);

        res.json({
            status: true,
            movie: movie,
            servers: data.episodes || []
        });
    } catch (error) {
        console.error("Lỗi /api/movie/:slug:", error.message);
        res.status(500).json({ status: false, message: "Lỗi khi tải chi tiết phim" });
    }
});

// Tìm kiếm phim
app.get('/api/search', async (req, res) => {
    try {
        const keyword = req.query.keyword || '';
        const response = await axios.get(`https://ophim1.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}`);
        const result = response.data?.data || response.data;

        const pathImage = result.pathImage || "https://ophimimg.com/uploads/movies/";
        const items = (result.items || []).map(item => ({
            slug: item.slug,
            name: item.name,
            origin_name: item.origin_name,
            year: item.year,
            lang: item.lang || 'Vietsub',
            thumb_url: fixImageUrl(item.thumb_url || item.poster_url, pathImage),
            episode_current: fixEpisodeStatus(item.episode_current, item.episode_total)
        }));

        res.json({
            status: true,
            items: items
        });
    } catch (error) {
        console.error("Lỗi /api/search:", error.message);
        res.status(500).json({ status: false, message: "Lỗi khi tìm kiếm phim" });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server đang chạy tại: http://localhost:${PORT}`);
});
