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

// Hàm chuẩn hóa URL hình ảnh thông minh
function normalizeImageUrl(url, source = 'ophim') {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;

    const domain = source === 'phimapi' ? 'https://img.phimapi.com' : 'https://img.ophim.live';
    let cleanPath = url.trim();
    if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);

    if (cleanPath.startsWith('uploads/movies/') || cleanPath.startsWith('uploads/')) {
        return `${domain}/${cleanPath}`;
    }
    if (cleanPath.startsWith('movies/')) {
        return `${domain}/uploads/${cleanPath}`;
    }

    return `${domain}/uploads/movies/${cleanPath}`;
}

// API: Lấy danh sách phim (Trang chủ & Danh mục)
app.get('/api/movies', async (req, res) => {
    try {
        const page = req.query.page || 1;
        const category = req.query.category || 'all';
        
        const ophimUrl = category === 'all' 
            ? `https://ophim1.com/v1/api/home?page=${page}`
            : `https://ophim1.com/v1/api/danh-sach/${category}?page=${page}`;

        const phimapiUrl = category === 'all'
            ? `https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=${page}`
            : `https://phimapi.com/v1/api/danh-sach/${category}?page=${page}`;

        const [ophimRes, phimapiRes] = await Promise.allSettled([
            axios.get(ophimUrl),
            axios.get(phimapiUrl)
        ]);

        const phimapiMap = new Map();
        let totalPages = 1;

        // 1. Lưu dữ liệu PhimAPI trước (Lấy tập phim và dữ liệu chuẩn từ PhimAPI)
        if (phimapiRes.status === 'fulfilled') {
            const data = phimapiRes.value.data;
            const items = data.items || data.data?.items || data.data?.data?.items || [];
            totalPages = data.pagination?.totalPages || data.data?.params?.pagination?.totalPages || data.data?.pagination?.totalPages || 1;
            
            items.forEach(item => {
                const slug = item.slug;
                if (slug) {
                    const rawImg = item.thumb_url || item.poster_url || item.thumb || '';
                    const imageUrl = normalizeImageUrl(rawImg, 'phimapi');
                    phimapiMap.set(slug, {
                        ...item,
                        thumb_url: imageUrl || 'https://placehold.co/300x400/121218/ffffff?text=No+Image',
                        poster_url: imageUrl || 'https://placehold.co/300x400/121218/ffffff?text=No+Image',
                        episode_current: normalizeEpisode(item.episode_current)
                    });
                }
            });
        }

        const finalMoviesMap = new Map();

        // 2. Đưa toàn bộ PhimAPI lên trước để đảm bảo tốc độ cập nhật phim mới
        phimapiMap.forEach((item, slug) => {
            finalMoviesMap.set(slug, item);
        });

        // 3. Duyệt qua Ophim: Kết hợp lấy ẢNH của Ophim (nếu có), nhưng GIỮ NGUYÊN tập phim của PhimAPI
        if (ophimRes.status === 'fulfilled') {
            const data = ophimRes.value.data;
            const items = data.data?.items || [];
            const ophimTotalPages = data.data?.params?.pagination?.totalPages;
            if (ophimTotalPages) totalPages = ophimTotalPages;

            items.forEach(item => {
                const slug = item.slug;
                if (slug) {
                    const rawImg = item.thumb_url || item.poster_url || item.thumb || '';
                    let imageUrl = normalizeImageUrl(rawImg, 'ophim');

                    if (phimapiMap.has(slug)) {
                        // Nếu phim đã có ở PhimAPI: Lấy tập phim của PhimAPI, nhưng ảnh ưu tiên lấy của Ophim (nếu Ophim có ảnh hợp lệ)
                        const phimapiItem = phimapiMap.get(slug);
                        if (!imageUrl || imageUrl.includes('No+Image')) {
                            imageUrl = phimapiItem.thumb_url;
                        }

                        finalMoviesMap.set(slug, {
                            ...phimapiItem, // Giữ trọn vẹn thông tin + tập phim mới nhất của PhimAPI
                            thumb_url: imageUrl,
                            poster_url: imageUrl
                        });
                    } else {
                        // Nếu phim chỉ có ở Ophim
                        finalMoviesMap.set(slug, {
                            ...item,
                            thumb_url: imageUrl || 'https://placehold.co/300x400/121218/ffffff?text=No+Image',
                            poster_url: imageUrl || 'https://placehold.co/300x400/121218/ffffff?text=No+Image',
                            episode_current: normalizeEpisode(item.episode_current)
                        });
                    }
                }
            });
        }

        res.json({
            status: true,
            items: Array.from(finalMoviesMap.values()),
            totalPages: totalPages
        });
    } catch (error) {
        console.error("Lỗi lấy danh sách phim:", error.message);
        res.status(500).json({ status: false, message: "Lỗi kết nối tới máy chủ phim" });
    }
});

// API: Tìm kiếm
app.get('/api/search', async (req, res) => {
    try {
        const keyword = req.query.keyword || '';
        const searchUrl = encodeURIComponent(keyword);

        const [ophimRes, phimapiRes] = await Promise.allSettled([
            axios.get(`https://ophim1.com/v1/api/tim-kiem?keyword=${searchUrl}&limit=20`),
            axios.get(`https://phimapi.com/v1/api/tim-kiem?keyword=${searchUrl}&limit=20`)
        ]);

        const phimapiMap = new Map();

        if (phimapiRes.status === 'fulfilled') {
            const data = phimapiRes.value.data;
            const items = data.items || data.data?.items || [];
            items.forEach(item => {
                const slug = item.slug;
                if (slug) {
                    const rawImg = item.thumb_url || item.poster_url || item.thumb || '';
                    const imageUrl = normalizeImageUrl(rawImg, 'phimapi');
                    phimapiMap.set(slug, {
                        ...item,
                        thumb_url: imageUrl || 'https://placehold.co/300x400/121218/ffffff?text=No+Image',
                        poster_url: imageUrl || 'https://placehold.co/300x400/121218/ffffff?text=No+Image',
                        episode_current: normalizeEpisode(item.episode_current)
                    });
                }
            });
        }

        const finalSearchMap = new Map();
        phimapiMap.forEach((item, slug) => {
            finalSearchMap.set(slug, item);
        });

        if (ophimRes.status === 'fulfilled') {
            const data = ophimRes.value.data;
            const items = data.data?.items || [];
            items.forEach(item => {
                const slug = item.slug;
                if (slug) {
                    const rawImg = item.thumb_url || item.poster_url || item.thumb || '';
                    let imageUrl = normalizeImageUrl(rawImg, 'ophim');

                    if (phimapiMap.has(slug)) {
                        const phimapiItem = phimapiMap.get(slug);
                        if (!imageUrl || imageUrl.includes('No+Image')) {
                            imageUrl = phimapiItem.thumb_url;
                        }

                        finalSearchMap.set(slug, {
                            ...phimapiItem,
                            thumb_url: imageUrl,
                            poster_url: imageUrl
                        });
                    } else {
                        finalSearchMap.set(slug, {
                            ...item,
                            thumb_url: imageUrl || 'https://placehold.co/300x400/121218/ffffff?text=No+Image',
                            poster_url: imageUrl || 'https://placehold.co/300x400/121218/ffffff?text=No+Image',
                            episode_current: normalizeEpisode(item.episode_current)
                        });
                    }
                }
            });
        }

        res.json({
            status: true,
            items: Array.from(finalSearchMap.values())
        });
    } catch (error) {
        console.error("Lỗi tìm kiếm phim:", error.message);
        res.status(500).json({ status: false, message: "Lỗi tìm kiếm" });
    }
});

// API: Chi tiết phim
app.get('/api/movie/:slug', async (req, res) => {
    try {
        const slug = req.params.slug;

        const [ophimRes, phimapiRes] = await Promise.allSettled([
            axios.get(`https://ophim1.com/v1/api/phim/${slug}`),
            axios.get(`https://phimapi.com/phim/${slug}`)
        ]);

        let ophimMovie = null;
        let phimapiMovie = null;
        let combinedServers = [];

        if (ophimRes.status === 'fulfilled' && ophimRes.value.data.status) {
            ophimMovie = ophimRes.value.data.data.item;
        }

        if (phimapiRes.status === 'fulfilled' && (phimapiRes.value.data.status || phimapiRes.value.data.movie)) {
            phimapiMovie = phimapiRes.value.data.movie || phimapiRes.value.data.data?.item;
        }

        let movie = ophimMovie || phimapiMovie;

        if (movie) {
            let rawImgOphim = ophimMovie?.thumb_url || ophimMovie?.poster_url || ophimMovie?.thumb || '';
            let rawImgPhimapi = phimapiMovie?.thumb_url || phimapiMovie?.poster_url || phimapiMovie?.thumb || '';

            let finalImg = normalizeImageUrl(rawImgOphim, 'ophim');
            if (!rawImgOphim || finalImg.includes('No+Image')) {
                finalImg = normalizeImageUrl(rawImgPhimapi, 'phimapi');
            }

            movie.thumb_url = finalImg || 'https://placehold.co/300x400/121218/ffffff?text=No+Image';
            movie.poster_url = finalImg || 'https://placehold.co/300x400/121218/ffffff?text=No+Image';
        }

        const phimapiServers = phimapiRes.status === 'fulfilled' ? (phimapiRes.value.data.episodes || phimapiRes.value.data.data?.episodes || []) : [];
        const ophimServers = ophimRes.status === 'fulfilled' && ophimRes.value.data.status ? (ophimRes.value.data.data.episodes || ophimRes.value.data.data?.item?.episodes || []) : [];

        phimapiServers.forEach((srv, idx) => {
            combinedServers.push({
                server_name: `PhimAPI - ${srv.server_name || srv.name || `Server #${idx + 1}`}`,
                server_data: srv.server_data || srv.items || srv
            });
        });

        ophimServers.forEach((srv, idx) => {
            combinedServers.push({
                server_name: `Ophim - ${srv.server_name || srv.name || `Server #${idx + 1}`}`,
                server_data: srv.server_data || srv.items || srv
            });
        });

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
