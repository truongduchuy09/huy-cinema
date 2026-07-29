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
            ? `https://phimapi.com/v1/api/home?page=${page}`
            : `https://phimapi.com/v1/api/danh-sach/${category}?page=${page}`;

        const [ophimRes, phimapiRes] = await Promise.allSettled([
            axios.get(ophimUrl),
            axios.get(phimapiUrl)
        ]);

        const phimapiMap = new Map();
        let totalPages = 1;

        // 1. Lưu dữ liệu PhimAPI trước
        if (phimapiRes.status === 'fulfilled') {
            const data = phimapiRes.value.data;
            const items = data.items || data.data?.items || [];
            totalPages = data.params?.pagination?.totalPages || data.data?.params?.pagination?.totalPages || 1;
            
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

        // 2. Ưu tiên đưa phim độc quyền hoặc phim mới từ PhimAPI lên trước (để chắc chắn phim mới hiển thị)
        phimapiMap.forEach((item, slug) => {
            finalMoviesMap.set(slug, item);
        });

        // 3. Duyệt qua Ophim: Ghi đè thông tin/ảnh của Ophim vào các phim trùng, giữ nguyên phim mới của PhimAPI
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

                    // Nếu Ophim có ảnh thì dùng ảnh Ophim, nếu không giữ lại ảnh PhimAPI cũ
                    if (!imageUrl || imageUrl.includes('No+Image')) {
                        if (phimapiMap.has(slug)) {
                            imageUrl = phimapiMap.get(slug).thumb_url;
                        }
                    }

                    finalMoviesMap.set(slug, {
                        ...item,
                        thumb_url: imageUrl || 'https://placehold.co/300x400/121218/ffffff?text=No+Image',
                        poster_url: imageUrl || 'https://placehold.co/300x400/121218/ffffff?text=No+Image',
                        episode_current: normalizeEpisode(item.episode_current)
                    });
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

                    if (!imageUrl || imageUrl.includes('No+Image')) {
                        if (phimapiMap.has(slug)) {
                            imageUrl = phimapiMap.get(slug).thumb_url;
                        }
                    }

                    finalSearchMap.set(slug, {
                        ...item,
                        thumb_url: imageUrl || 'https://placehold.co/300x400/121218/ffffff?text=No+Image',
                        poster_url: imageUrl || 'https://placehold.co/300x400/121218/ffffff?text=No+Image',
                        episode_current: normalizeEpisode(item.episode_current)
                    });
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

        let movie = null;
        let combinedServers = [];
        let hasOphim = false;

        if (ophimRes.status === 'fulfilled' && ophimRes.value.data.status) {
            const ophimData = ophimRes.value.data;
            movie = ophimData.data.item;
            if (movie) {
                hasOphim = true;
                const rawImg = movie.thumb_url || movie.poster_url || movie.thumb || '';
                movie.thumb_url = normalizeImageUrl(rawImg, 'ophim');
                movie.poster_url = normalizeImageUrl(rawImg, 'poster_url' in movie ? movie.poster_url : rawImg);
            }
            const ophimServers = ophimData.data.episodes || ophimData.data.item?.episodes || [];
            ophimServers.forEach((srv, idx) => {
                combinedServers.push({
                    server_name: `Ophim - ${srv.server_name || srv.name || `Server #${idx + 1}`}`,
                    server_data: srv.server_data || srv.items || srv
                });
            });
        }

        if (phimapiRes.status === 'fulfilled' && (phimapiRes.value.data.status || phimapiRes.value.data.movie)) {
            const phimapiData = phimapiRes.value.data;
            
            if (!hasOphim) {
                movie = phimapiData.movie || phimapiData.data?.item;
                if (movie) {
                    const rawImg = movie.thumb_url || movie.poster_url || movie.thumb || '';
                    movie.thumb_url = normalizeImageUrl(rawImg, 'phimapi');
                    movie.poster_url = normalizeImageUrl(rawImg, 'phimapi');
                }
            } else if (movie && (!movie.thumb_url || movie.thumb_url.includes('No+Image'))) {
                const phimapiMovie = phimapiData.movie || phimapiData.data?.item;
                if (phimapiMovie) {
                    const rawImg = phimapiMovie.thumb_url || phimapiMovie.poster_url || '';
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
