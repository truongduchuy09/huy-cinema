const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. LẤY DANH SÁCH PHIM THEO CATEGORY & TRANG
app.get('/api/movies', async (req, res) => {
    const page = req.query.page || 1;
    const category = req.query.category || 'all';

    let apiUrl = `https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=${page}`;

    if (category === 'phim-bo') {
        apiUrl = `https://phimapi.com/v1/api/danh-sach/phim-bo?page=${page}&limit=24`;
    } else if (category === 'phim-le') {
        apiUrl = `https://phimapi.com/v1/api/danh-sach/phim-le?page=${page}&limit=24`;
    } else if (category === 'hoat-hinh') {
        apiUrl = `https://phimapi.com/v1/api/danh-sach/hoat-hinh?page=${page}&limit=24`;
    } else if (category === 'tv-shows') {
        apiUrl = `https://phimapi.com/v1/api/danh-sach/tv-shows?page=${page}&limit=24`;
    }

    try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (category === 'all') {
            const items = (data.items || []).map(item => ({
                name: item.name,
                origin_name: item.origin_name,
                slug: item.slug,
                year: item.year,
                episode_current: item.episode_current || 'Full',
                lang: item.lang || 'Vietsub',
                thumb_url: item.thumb_url
            }));

            return res.json({
                status: true,
                items: items,
                totalPages: data.pagination?.totalPages || 10
            });
        } else {
            const domainImage = data.data?.APP_DOMAIN_CDN_IMAGE || 'https://phimimg.com';
            const items = (data.data?.items || []).map(item => {
                let thumb = item.thumb_url || item.poster_url;
                if (thumb && !thumb.startsWith('http')) {
                    thumb = `${domainImage}/${thumb.replace(/^\//, '')}`;
                }
                return {
                    name: item.name,
                    origin_name: item.origin_name,
                    slug: item.slug,
                    year: item.year,
                    episode_current: item.episode_current || 'Full',
                    lang: item.lang || 'Vietsub',
                    thumb_url: thumb
                };
            });

            return res.json({
                status: true,
                items: items,
                totalPages: data.data?.params?.pagination?.totalPages || 10
            });
        }
    } catch (error) {
        console.error("Lỗi lấy danh sách phim:", error);
        res.status(500).json({ status: false, message: "Lỗi Server" });
    }
});

// 2. TÌM KIẾM PHIM THÔNG MINH 2 LỚP (PHIMAPI -> OPHIM)
app.get('/api/search', async (req, res) => {
    const { keyword } = req.query;

    if (!keyword || keyword.trim() === '') {
        return res.json({ status: true, items: [] });
    }

    try {
        const response = await fetch(`https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=24`);
        const data = await response.json();

        if (data.status && data.data && data.data.items && data.data.items.length > 0) {
            const domainImage = data.data.APP_DOMAIN_CDN_IMAGE || 'https://phimimg.com';
            const items = data.data.items.map(item => {
                let thumb = item.thumb_url || item.poster_url;
                if (thumb && !thumb.startsWith('http')) {
                    thumb = `${domainImage}/${thumb.replace(/^\//, '')}`;
                }
                return {
                    name: item.name,
                    origin_name: item.origin_name,
                    slug: item.slug,
                    year: item.year,
                    episode_current: item.episode_current || 'Full',
                    lang: item.lang || 'Vietsub',
                    thumb_url: thumb
                };
            });

            return res.json({ status: true, items });
        }

        const resOphim = await fetch(`https://ophim1.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=24`);
        const dataOphim = await resOphim.json();

        if (dataOphim.status && dataOphim.data && dataOphim.data.items) {
            const domainImage = dataOphim.data.APP_DOMAIN_CDN_IMAGE || 'https://img.ophim.live/uploads/movies';
            const items = dataOphim.data.items.map(item => {
                let thumb = item.thumb_url || item.poster_url;
                if (thumb && !thumb.startsWith('http')) {
                    thumb = `${domainImage}/${thumb.replace(/^\//, '')}`;
                }
                return {
                    name: item.name,
                    origin_name: item.origin_name,
                    slug: item.slug,
                    year: item.year,
                    episode_current: item.episode_current || 'Full',
                    lang: item.lang || 'Vietsub',
                    thumb_url: thumb
                };
            });

            return res.json({ status: true, items });
        }

        res.json({ status: true, items: [] });
    } catch (error) {
        console.error("Lỗi API Tìm kiếm:", error);
        res.status(500).json({ status: false, message: "Lỗi Server khi tìm kiếm!" });
    }
});

// 3. CHI TIẾT PHIM (GỘP SONG SONG SERVER OPHIM VÀ PHIMAPI)
app.get('/api/movie/:slug', async (req, res) => {
    const { slug } = req.params;

    try {
        const [resOphim, resPhimapi] = await Promise.allSettled([
            fetch(`https://ophim1.com/phim/${slug}`).then(r => r.json()),
            fetch(`https://phimapi.com/phim/${slug}`).then(r => r.json())
        ]);

        let combinedServers = [];
        let movieData = null;

        if (resOphim.status === 'fulfilled' && resOphim.value.status) {
            const data = resOphim.value;
            movieData = data.movie;
            if (data.episodes) {
                data.episodes.forEach((srv) => {
                    combinedServers.push({
                        server_name: `Server Ophim ${srv.server_name ? `(${srv.server_name})` : ''}`,
                        server_data: srv.server_data
                    });
                });
            }
        }

        if (resPhimapi.status === 'fulfilled' && resPhimapi.value.status) {
            const data = resPhimapi.value;
            if (!movieData) movieData = data.movie;
            if (data.episodes) {
                data.episodes.forEach((srv) => {
                    combinedServers.push({
                        server_name: `Server Phimapi ${srv.server_name ? `(${srv.server_name})` : ''}`,
                        server_data: srv.server_data
                    });
                });
            }
        }

        if (!movieData) {
            return res.json({ status: false, message: "Không tìm thấy phim!" });
        }

        res.json({
            status: true,
            movie: movieData,
            servers: combinedServers
        });

    } catch (error) {
        console.error("Lỗi lấy chi tiết phim:", error);
        res.status(500).json({ status: false, message: "Lỗi Server" });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
