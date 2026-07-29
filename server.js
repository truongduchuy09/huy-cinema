const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- BỘ NHỚ ĐỆM (IN-MEMORY CACHE) ---
const apiCache = new Map();

function getFromCache(key) {
    const cached = apiCache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiry) {
        apiCache.delete(key);
        return null;
    }
    return cached.data;
}

function setToCache(key, data, ttlSeconds = 300) { // Mặc định lưu cache 5 phút
    apiCache.set(key, {
        data: data,
        expiry: Date.now() + (ttlSeconds * 1000)
    });
}

// --- HÀM TỐI ƯU & CHUẨN HÓA DỮ LIỆU CHUNG ---
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

// --- DRIVERS LẤY DỮ LIỆU ---
async function fetchFromOphim(page, category) {
    let url = (category === 'all') 
        ? `https://ophim1.com/danh-sach/phim-moi-cap-nhat?page=${page}`
        : `https://ophim1.com/v1/api/danh-sach/${category}?page=${page}`;

    const res = await axios.get(url, { timeout: 5000 });
    const data = res.data;

    let rawItems = [];
    let pathImage = "https://ophimimg.com/uploads/movies/";
    let totalItems = 0;
    let totalItemsPerPage = 10;

    if (category === 'all') {
        rawItems = data.items || [];
        pathImage = data.pathImage || pathImage;
        totalItems = data.pagination?.totalItems || 0;
        totalItemsPerPage = data.pagination?.totalItemsPerPage || 10;
    } else {
        const resData = data.data || {};
        rawItems = resData.items || [];
        pathImage = resData.APP_DOMAIN_CDN_IMAGE || pathImage;
        totalItems = resData.params?.pagination?.totalItems || 0;
        totalItemsPerPage = resData.params?.pagination?.totalItemsPerPage || 10;
    }

    return {
        totalPages: totalItems ? Math.ceil(totalItems / totalItemsPerPage) : 1,
        items: rawItems.map(item => ({
            slug: item.slug,
            name: item.name,
            origin_name: item.origin_name,
            year: item.year,
            lang: item.lang || 'Vietsub',
            thumb_url: fixImageUrl(item.thumb_url || item.poster_url, pathImage),
            episode_current: fixEpisodeStatus(item.episode_current, item.episode_total)
        }))
    };
}

async function fetchFromPhimAPI(page, category) {
    let url = (category === 'all')
        ? `https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=${page}`
        : `https://phimapi.com/v1/api/danh-sach/${category}?page=${page}`;

    const res = await axios.get(url, { timeout: 5000 });
    const data = res.data;

    let rawItems = [];
    let pathImage = "https://phimimg.com/uploads/movies/";
    let totalItems = 0;
    let totalItemsPerPage = 10;

    if (category === 'all') {
        rawItems = data.items || [];
        pathImage = data.pathImage || pathImage;
        totalItems = data.pagination?.totalItems || 0;
        totalItemsPerPage = data.pagination?.totalItemsPerPage || 10;
    } else {
        const resData = data.data || {};
        rawItems = resData.items || [];
        pathImage = resData.APP_DOMAIN_CDN_IMAGE || pathImage;
        totalItems = resData.params?.pagination?.totalItems || 0;
        totalItemsPerPage = resData.params?.pagination?.totalItemsPerPage || 10;
    }

    return {
        totalPages: totalItems ? Math.ceil(totalItems / totalItemsPerPage) : 1,
        items: rawItems.map(item => ({
            slug: item.slug,
            name: item.name,
            origin_name: item.origin_name,
            year: item.year,
            lang: item.lang || 'Vietsub',
            thumb_url: fixImageUrl(item.thumb_url || item.poster_url, pathImage),
            episode_current: fixEpisodeStatus(item.episode_current, item.episode_total)
        }))
    };
}

// --- API ROUTES ---

// 1. API Danh sách phim (Có Cache)
app.get('/api/movies', async (req, res) => {
    const page = req.query.page || 1;
    const category = req.query.category || 'all';
    const source = req.query.source || 'ophim';
    const cacheKey = `list_${category}_${page}_${source}`;

    // Trả về dữ liệu từ Cache nếu có
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
        return res.json({ ...cachedData, fromCache: true });
    }

    try {
        let result = (source === 'phimapi') 
            ? await fetchFromPhimAPI(page, category)
            : await fetchFromOphim(page, category);

        const responsePayload = {
            status: true,
            currentPage: Number(page),
            totalPages: result.totalPages,
            items: result.items
        };

        setToCache(cacheKey, responsePayload, 300); // Cache 5 phút
        res.json(responsePayload);
    } catch (error) {
        console.warn(`[Failover] Nguồn ${source} gặp sự cố, thử nguồn dự phòng...`);
        try {
            const fallbackResult = (source === 'ophim') 
                ? await fetchFromPhimAPI(page, category)
                : await fetchFromOphim(page, category);

            const responsePayload = {
                status: true,
                currentPage: Number(page),
                totalPages: fallbackResult.totalPages,
                items: fallbackResult.items
            };

            setToCache(cacheKey, responsePayload, 120); // Cache 2 phút cho nguồn dự phòng
            res.json(responsePayload);
        } catch (err) {
            res.status(500).json({ status: false, message: "Lỗi kết nối toàn bộ hệ thống API nguồn" });
        }
    }
});

// 2. API Chi tiết phim (Có Cache)
app.get('/api/movie/:slug', async (req, res) => {
    const { slug } = req.params;
    const cacheKey = `movie_${slug}`;

    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
        return res.json({ ...cachedData, fromCache: true });
    }

    // Thử Ophim
    try {
        const resOphim = await axios.get(`https://ophim1.com/phim/${slug}`, { timeout: 4000 });
        if (resOphim.data?.status && resOphim.data?.movie) {
            const data = resOphim.data;
            data.movie.thumb_url = fixImageUrl(data.movie.thumb_url || data.movie.poster_url, data.pathImage);
            const responsePayload = { status: true, movie: data.movie, servers: data.episodes || [] };
            
            setToCache(cacheKey, responsePayload, 600); // Cache 10 phút
            return res.json(responsePayload);
        }
    } catch (e) {}

    // Thử PhimAPI
    try {
        const resPhimAPI = await axios.get(`https://phimapi.com/phim/${slug}`, { timeout: 4000 });
        if (resPhimAPI.data?.status && resPhimAPI.data?.movie) {
            const data = resPhimAPI.data;
            const pathImg = data.movie.poster_url?.includes('http') ? '' : 'https://phimimg.com/';
            data.movie.thumb_url = fixImageUrl(data.movie.thumb_url || data.movie.poster_url, pathImg);
            const responsePayload = { status: true, movie: data.movie, servers: data.episodes || [] };
            
            setToCache(cacheKey, responsePayload, 600); // Cache 10 phút
            return res.json(responsePayload);
        }
    } catch (e) {}

    res.status(404).json({ status: false, message: "Không tìm thấy chi tiết phim" });
});

// 3. API Tìm kiếm phim (Có Cache)
app.get('/api/search', async (req, res) => {
    const keyword = (req.query.keyword || '').trim();
    if (!keyword) return res.json({ status: true, items: [] });

    const cacheKey = `search_${keyword.toLowerCase()}`;
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
        return res.json({ ...cachedData, fromCache: true });
    }

    try {
        const [resOphim, resPhimAPI] = await Promise.allSettled([
            axios.get(`https://ophim1.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}`, { timeout: 4000 }),
            axios.get(`https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}`, { timeout: 4000 })
        ]);

        let combinedItems = [];
        const seenSlugs = new Set();

        const processItems = (items, pathImg) => {
            (items || []).forEach(item => {
                if (!seenSlugs.has(item.slug)) {
                    seenSlugs.add(item.slug);
                    combinedItems.push({
                        slug: item.slug,
                        name: item.name,
                        origin_name: item.origin_name,
                        year: item.year,
                        lang: item.lang || 'Vietsub',
                        thumb_url: fixImageUrl(item.thumb_url || item.poster_url, pathImg),
                        episode_current: fixEpisodeStatus(item.episode_current, item.episode_total)
                    });
                }
            });
        };

        if (resOphim.status === 'fulfilled' && resOphim.data?.data?.items) {
            processItems(resOphim.data.data.items, resOphim.data.data.pathImage || "https://ophimimg.com/uploads/movies/");
        }

        if (resPhimAPI.status === 'fulfilled' && resPhimAPI.data?.data?.items) {
            processItems(resPhimAPI.data.data.items, resPhimAPI.data.data.APP_DOMAIN_CDN_IMAGE || "https://phimimg.com/uploads/movies/");
        }

        const responsePayload = { status: true, items: combinedItems };
        setToCache(cacheKey, responsePayload, 300);
        res.json(responsePayload);
    } catch (error) {
        res.status(500).json({ status: false, message: "Lỗi hệ thống khi tìm kiếm" });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server Đã Tối Ưu Đang Chạy Tại: http://localhost:${PORT}`);
});
