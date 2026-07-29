const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Phục vụ các file tĩnh trong thư mục public
app.use(express.static(path.join(__dirname, 'public')));

const SOURCES = {
    OPHIM: "https://ophim1.com",
    PHIMAPI: "https://phimapi.com",
    NGUONC: "https://phim.nguonc.com/api"
};

// 1. API LẤY DANH SÁCH PHIM (GỘP & LỌC TRÙNG)
app.get('/api/movies', async (req, res) => {
    const page = req.query.page || 1;
    const category = req.query.category || 'all';

    try {
        let ophimUrl = `${SOURCES.OPHIM}/danh-sach/phim-moi-cap-nhat?page=${page}`;
        let phimapiUrl = `${SOURCES.PHIMAPI}/danh-sach/phim-moi-cap-nhat?page=${page}`;
        let nguoncUrl = `${SOURCES.NGUONC}/films/phim-moi-cap-nhat?page=${page}`;

        if (category === 'hoat-hinh') {
            ophimUrl = `${SOURCES.OPHIM}/v1/api/danh-sach/hoat-hinh?page=${page}`;
            phimapiUrl = `${SOURCES.PHIMAPI}/v1/api/danh-sach/hoat-hinh?page=${page}`;
            nguoncUrl = `${SOURCES.NGUONC}/films/the-loai/hoat-hinh?page=${page}`;
        } else if (category === 'phim-bo') {
            ophimUrl = `${SOURCES.OPHIM}/v1/api/danh-sach/phim-bo?page=${page}`;
            phimapiUrl = `${SOURCES.PHIMAPI}/v1/api/danh-sach/phim-bo?page=${page}`;
            nguoncUrl = `${SOURCES.NGUONC}/films/danh-sach/phim-bo?page=${page}`;
        } else if (category === 'phim-le') {
            ophimUrl = `${SOURCES.OPHIM}/v1/api/danh-sach/phim-le?page=${page}`;
            phimapiUrl = `${SOURCES.PHIMAPI}/v1/api/danh-sach/phim-le?page=${page}`;
            nguoncUrl = `${SOURCES.NGUONC}/films/danh-sach/phim-le?page=${page}`;
        }

        const [ophimRes, phimapiRes, nguoncRes] = await Promise.allSettled([
            fetch(ophimUrl).then(r => r.json()),
            fetch(phimapiUrl).then(r => r.json()),
            fetch(nguoncUrl).then(r => r.json())
        ]);

        let rawList = [];

        if (ophimRes.status === 'fulfilled' && ophimRes.value) {
            const items = ophimRes.value.items || ophimRes.value.data?.items || [];
            const baseImg = ophimRes.value.pathImage || 'https://ophimimg.com/uploads/movies/';
            items.forEach(item => rawList.push(normalizeMovieItem(item, 'Ophim', baseImg)));
        }

        if (phimapiRes.status === 'fulfilled' && phimapiRes.value) {
            const items = phimapiRes.value.items || phimapiRes.value.data?.items || [];
            items.forEach(item => rawList.push(normalizeMovieItem(item, 'PhimAPI', 'https://phimimg.com/upload/vod/')));
        }

        if (nguoncRes.status === 'fulfilled' && nguoncRes.value) {
            const items = nguoncRes.value.items || [];
            items.forEach(item => rawList.push(normalizeMovieItem(item, 'NguonC', '')));
        }

        const uniqueMoviesMap = new Map();
        rawList.forEach(movie => {
            const key = movie.slug || movie.name.toLowerCase().trim();
            if (!uniqueMoviesMap.has(key)) {
                uniqueMoviesMap.set(key, movie);
            }
        });

        res.json({
            status: true,
            page: Number(page),
            totalPages: 50,
            items: Array.from(uniqueMoviesMap.values())
        });

    } catch (err) {
        console.error("Lỗi Server:", err);
        res.status(500).json({ status: false, message: "Lỗi kết nối Server API" });
    }
});

// 2. API LẤY CHI TIẾT PHIM
app.get('/api/movie/:slug', async (req, res) => {
    const slug = req.params.slug;

    try {
        const [ophimRes, phimapiRes, nguoncRes] = await Promise.allSettled([
            fetch(`${SOURCES.OPHIM}/phim/${slug}`).then(r => r.json()),
            fetch(`${SOURCES.PHIMAPI}/phim/${slug}`).then(r => r.json()),
            fetch(`${SOURCES.NGUONC}/film/${slug}`).then(r => r.json())
        ]);

        let movieDetail = null;
        let servers = [];

        // NGUỒN OPHIM
        if (ophimRes.status === 'fulfilled' && ophimRes.value?.status) {
            movieDetail = ophimRes.value.movie;
            const eps = ophimRes.value.episodes?.[0]?.server_data || [];
            if (eps.length > 0) {
                servers.push({
                    server_name: "Ophim",
                    server_data: eps.map(e => ({ name: e.name, link_m3u8: e.link_m3u8 }))
                });
            }
        }

        // NGUỒN PHIMAPI
        if (phimapiRes.status === 'fulfilled' && phimapiRes.value?.status) {
            if (!movieDetail) movieDetail = phimapiRes.value.movie;
            const eps = phimapiRes.value.episodes?.[0]?.server_data || [];
            if (eps.length > 0) {
                servers.push({
                    server_name: "PhimAPI",
                    server_data: eps.map(e => ({ name: e.name, link_m3u8: e.link_m3u8 }))
                });
            }
        }

        // NGUỒN NGUONC
        if (nguoncRes.status === 'fulfilled' && nguoncRes.value?.status === 'success') {
            const film = nguoncRes.value.movie;
            if (!movieDetail) {
                movieDetail = {
                    name: film.name,
                    origin_name: film.original_name,
                    slug: film.slug,
                    thumb_url: film.thumb_url,
                    poster_url: film.poster_url,
                    year: film.category?.['3']?.list?.[0]?.name || ''
                };
            }
            const items = nguoncRes.value.episodes?.[0]?.items || [];
            if (items.length > 0) {
                servers.push({
                    server_name: "NguonC",
                    server_data: items.map(e => ({ name: e.name, link_m3u8: e.m3u8 || e.embed }))
                });
            }
        }

        if (!movieDetail) {
            return res.status(404).json({ status: false, message: "Không tìm thấy phim!" });
        }

        res.json({
            status: true,
            movie: movieDetail,
            servers: servers
        });

    } catch (err) {
        console.error("Lỗi lấy chi tiết:", err);
        res.status(500).json({ status: false, message: "Lỗi Server" });
    }
});

function normalizeMovieItem(item, sourceName, baseImg) {
    let thumb = item.thumb_url || item.poster_url || "";
    if (thumb && !thumb.startsWith('http')) {
        let clean = thumb.replace(/^\/+/, '');
        thumb = `${baseImg.endsWith('/') ? baseImg : baseImg + '/'}${clean}`;
    }

    return {
        name: item.name,
        origin_name: item.origin_name || item.original_name || '',
        slug: item.slug,
        thumb_url: thumb,
        year: item.year || '',
        episode_current: item.episode_current || 'Full',
        lang: item.lang || 'Vietsub',
        source: sourceName
    };
}

// FIX CHÍNH: Trả về file index.html cho tất cả các request không phải API
app.get('*', (req, res) => {
    // Nếu index.html nằm trong thư mục public:
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
    
    // Lưu ý: Nếu file index.html của bạn nằm ở thư mục gốc (không nằm trong public), hãy sửa dòng trên thành:
    // res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server Huy Cinema đang chạy tại port ${PORT}`);
});
