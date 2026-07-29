const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Phục vụ file tĩnh từ thư mục public
app.use(express.static(path.join(__dirname, 'public')));

// --- HÀM BỔ TRỢ CHUẨN HÓA DỮ LIỆU ---

// Nối domain ảnh nếu API trả về link tương đối
function fixImageUrl(rawUrl, pathImage = "https://ophimimg.com/uploads/movies/") {
    if (!rawUrl) return 'https://placehold.co/300x400/1f2937/ffffff?text=No+Image';
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        return rawUrl;
    }
    const cleanPath = rawUrl.replace(/^\/+/, '');
    const base = pathImage.endsWith('/') ? pathImage : `${pathImage}/`;
    return `${base}${cleanPath}`;
}

// Xử lý chuỗi hiển thị số tập
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

// 1. Lấy danh sách phim theo trang (Đã sửa lỗi 50 trang, đứt ảnh & hiển thị tập)
app.get('/api/movies', async (req, res) => {
    try {
        const page = req.query.page || 1;
        const response = await axios.get(`https://ophim1.com/danh-sach/phim-moi-cap-nhat?page=${page}`);
        const data = response.data;

        const pathImage = data.pathImage || "https://ophimimg.com/uploads/movies/";
        const pagination = data.pagination || {};
        
        // Tính tổng số trang chính xác dựa trên totalItems và totalItemsPerPage từ API
        const totalItems = pagination.totalItems || 0;
        const totalItemsPerPage = pagination.totalItemsPerPage || 10;
        const totalPages = totalItems ? Math.ceil(totalItems / totalItemsPerPage) : 1;

        const items = (data.items || []).map(item => ({
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

// 2. Chi tiết phim & danh sách Server
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

// 3. Tìm kiếm phim
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

// Mọi route khác đều chuyển về trang index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server đang chạy tại: http://localhost:${PORT}`);
});
