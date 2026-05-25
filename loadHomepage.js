const ORCID = "0009-0001-1824-0307";
const CACHE_KEY = `pub_cache_${ORCID}`;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

async function loadHomepage() {

    try {
        const md = await fetch("./content/homepage.md");
        if (!md.ok)
            throw new Error("Failed to load homepage content");

        let data = await md.text();

        data = data.replace(
            '{{PUBLICATIONS}}',
            'PUBLICATIONS_PLACEHOLDER'
        );
        document.querySelector('.main-content').innerHTML =
            marked.parse(data, { renderer });

        const content = document.querySelector('.main-content');
        content.innerHTML = content.innerHTML.replace(
            'PUBLICATIONS_PLACEHOLDER',
            '<div id="publication-list"><p>Loading publications...</p></div>'
        ); 
        loadPublications();

    }
    catch(error){
        console.error(error);
        document.querySelector('.main-content').innerHTML =
            "<p>Failed to load content.</p>";
    }
}

async function loadPublications(){

    const container = document.getElementById('publication-list');

    try{
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached){
            const cacheObj = JSON.parse(cached);
            const age = Date.now() - cacheObj.timestamp;
            if (age < CACHE_DURATION){
                console.log("Using cached publications");
                container.innerHTML =
                    marked.parse(cacheObj.data,{renderer});
                return;
            }
        }
    
        console.log("Fetching publications from ORCID");

        const orcidResponse = await fetch(
            `https://pub.orcid.org/v3.0/${ORCID}/works`,
            {
                headers:{
                    'Accept':'application/json'
                }
            }
        );

        if (!orcidResponse.ok)
            throw new Error("Failed to fetch ORCID works");

        const works = await orcidResponse.json();

        const requests = works.group.map(async work=>{

            try{
                const summary = work['work-summary'][0];

                const doi = summary['external-ids']
                    ?.['external-id']
                    ?.find(id=>id['external-id-type']==='doi')
                    ?.['external-id-value'];

                if (!doi) return null;

                const crossrefResponse =
                    await fetch(`https://api.crossref.org/works/${doi}`);

                if (!crossrefResponse.ok) return null;

                const item = (await crossrefResponse.json()).message;

                const normalizeORCID = id =>
                    (id || '')
                    .replace('https://orcid.org/','')
                    .replace('http://orcid.org/','')
                    .trim();

                const normalizeName = s =>
                    (s || '')
                    .toLowerCase()
                    .replace(/\s+/g,' ')
                    .replace(/[^a-z\s]/g,'')
                    .trim();

                const myORCIDNorm = normalizeORCID(ORCID);

                const MY_NAME = "Ye Zheng";
                const myNameNorm = normalizeName(MY_NAME);

                const authors = item.author
                    ?.map(a=>{

                        const given = a.given || '';
                        const family = a.family || '';

                        const fullName =
                            `${given} ${family}`.trim();

                        const initials = given
                            ?.split(' ')
                            .map(n=>n[0])
                            .join('');

                        const displayName =
                            `${family} ${initials}`.trim();

                        const authorORCID =
                            normalizeORCID(a.ORCID);

                        const isMeByORCID =
                            authorORCID===myORCIDNorm;

                        const authorNameNorm =
                            normalizeName(fullName);

                        const isMeByName =
                            !isMeByORCID &&
                            (
                                authorNameNorm===myNameNorm ||
                                authorNameNorm.includes(myNameNorm)
                            );

                        const isMe =
                            isMeByORCID || isMeByName;

                        return isMe
                            ? `**${displayName}**`: displayName;
                    })
                    .join(', ') || 'Unknown Authors';

                const title =
                    item.title?.[0] || 'Untitled';

                const journal =
                    item['container-title']?.[0]
                    || 'Unknown Journal';

                const year =
                    item.published?.['date-parts']?.[0]?.[0]
                    || item.created?.['date-parts']?.[0]?.[0]
                    || 'Unknown Year';

                const volume = item.volume || '';
                const pages = item.page || '';

                return `${authors} (${year}) ${title}: *${journal}*, v. ${volume}, p. ${pages}. https://doi.org/${doi}`;
            }
            catch(error){
                console.warn(error);
                return null;
            }
        });

        const results =
            await Promise.all(requests);

        const publications =
            results.filter(Boolean).join('\n\n');

        localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
                timestamp: Date.now(),
                data: publications
            })
        )

        container.innerHTML =
            marked.parse(publications,{renderer});

    }
    catch(error){
        console.error(error);
        const container =
            document.getElementById('publication-list');
        if(container){
            container.innerHTML =
                marked.parse(publications,{renderer});
        }
    }
}