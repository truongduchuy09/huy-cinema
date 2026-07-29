const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Cấu hình phục vụ file tĩnh từ thư mục public
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Hàm chuẩn hóa chuỗi tập phim ở Backend để chống lặp từ "Tập"
function normalizeEpisode(epText) {
    if (!epText) return 'Full';
    let clean = epText.replace(/tập\s*/gi, '').trim();
    if (!clean || clean.toLowerCase() === 'full') return 'Full';
    return `Tập ${clean}`;
}

// API: Lấy danh sách phim theo danh mục và phân trang
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

        if (data && data.data && data.data.items) {
            data.data.items = data.data.items.map(item => ({
                ...item,
                episode_current: normalizeEpisode(item.episode_current)
            }));
        }

        res.json({
            status: true,
            items: data.data.items || [],
            totalPages: data.data.params?.pagination?.totalPages || 1
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
            episode_current: normalizeEpisode(item.episode_current)
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

// API: Lấy chi tiết phim và danh sách tập / nguồn phát
app.get('/api/movie/:slug', async (req, res) => {
    try {
        const slug = req.params.slug;
        const url = `https://ophim1.com/v1/api/phim/${slug}`;

        const response = await axios.get(url);
        const data = response.data;

        if (!data.status) {
            return res.status(404).json({ status: false, message: "Không tìm thấy phim" });
        }

        res.json({
            status: true,
            movie: data.data.item,
            servers: data.data.item.episodes || []
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
