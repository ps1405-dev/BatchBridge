"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@supabase/supabase-js";
import ProvenanceModal from "./components/ProvenanceModal";

const Map = dynamic(() => import("./components/NearbyMap"), { ssr: false });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder"
);

export default function Home() {
  const [session, setSession] = useState();
  const [maker, setMaker] = useState();
  const [products, setProducts] = useState([]);
  const [leads, setLeads] = useState([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [discoverId, setDiscoverId] = useState("");
  const [rankId, setRankId] = useState("");
  const [viewId, setViewId] = useState("");
  const [advice, setAdvice] = useState();

  // Provenance Studio State Extensions
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState("huggingface");
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const requestLock = useRef(false);
  const productLock = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription: s },
    } = supabase.auth.onAuthStateChange((_, x) => setSession(x));
    return () => s.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session]);

  useEffect(() => {
    if (products[0]) {
      for (const set of [setDiscoverId, setRankId, setViewId])
        set((x) => (products.some((p) => p.id === x) ? x : products[0].id));
    }
  }, [products]);

  async function load() {
    const [{ data: m }, { data: p }, { data: l }] = await Promise.all([
      supabase
        .from("makers")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle(),
      supabase.from("products").select("*").order("created_at"),
      supabase
        .from("leads")
        .select("*")
        .eq("user_id", session.user.id)
        .order("score", { ascending: false }),
    ]);
    setMaker(m);
    setProducts(p || []);
    setLeads(l || []);
  }

  async function auth(e, signup = false) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      r = signup
        ? await supabase.auth.signUp({
            email: String(f.get("email")),
            password: String(f.get("password")),
          })
        : await supabase.auth.signInWithPassword({
            email: String(f.get("email")),
            password: String(f.get("password")),
          });
    setNotice(
      r.error?.message ||
        (signup ? "Check your email to confirm your account." : "Signed in.")
    );
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin },
    });
    if (error) setNotice(error.message);
  }

  async function saveMaker(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      v = {
        user_id: session.user.id,
        name: f.get("name"),
        category: f.get("category"),
        address: f.get("address"),
        city: f.get("city"),
      };
    const { error } = maker
      ? await supabase.from("makers").update(v).eq("id", maker.id)
      : await supabase.from("makers").insert(v);
    setNotice(error?.message || "Profile saved.");
    load();
  }

  async function add(e) {
    e.preventDefault();
    if (productLock.current) return;
    productLock.current = true;
    setBusy("product");
    const f = new FormData(e.currentTarget),
      name = String(f.get("name")).trim();
    if (
      products.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())
    ) {
      setNotice(
        `“${name}” already exists. Edit the existing product instead of adding it again.`
      );
      productLock.current = false;
      setBusy("");
      return;
    }
    try {
      const insert = supabase
        .from("products")
        .insert({
          maker_id: maker.id,
          name,
          wholesale_price: f.get("price"),
          capacity: f.get("capacity"),
        })
        .select()
        .single();
      const timeout = new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "Saving took too long. Check your connection and try once."
              )
            ),
          12000
        )
      );
      const { data, error } = await Promise.race([insert, timeout]);
      if (error) throw error;
      setProducts((current) => [...current, data]);
      setNotice("Product added.");
      e.currentTarget.reset();
    } catch (error) {
      setNotice(error.message || "Could not add product.");
    } finally {
      productLock.current = false;
      setBusy("");
    }
  }

  async function api(path, productId, body = {}, label) {
    if (requestLock.current) return;
    requestLock.current = true;
    setBusy(label);
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ makerId: maker.id, productId, ...body }),
      });
      const d = await r.json();
      setNotice(
        d.error || `${d.discovered ?? d.ranked} real businesses processed.`
      );
      if (d.advice) setAdvice(d.advice);
      await load();
    } catch {
      setNotice("Could not contact the server.");
    } finally {
      setBusy("");
      requestLock.current = false;
    }
  }

  function locate() {
    navigator.geolocation?.getCurrentPosition(
      (p) =>
        api(
          "/api/discover",
          discoverId,
          { latitude: p.coords.latitude, longitude: p.coords.longitude },
          "discover"
        ),
      () => setNotice("Location permission was denied."),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  // Provenance Studio Asset Generation Handler
  const handleGenerateProvenanceAsset = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setBusy("generate_asset");

    try {
      const res = await fetch("http://localhost:8000/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, provider }),
      });

      const data = await res.json();

      if (res.ok) {
        const newRun = {
          id: data.run_id || Date.now().toString(),
          prompt,
          provider,
          asset_url: data.asset_url,
          manifest_url: data.manifest_url,
          sha256: data.sha256 || data.manifest?.output_hash,
          manifest: data.manifest,
          timestamp: new Date().toLocaleTimeString(),
        };

        setRuns((prev) => [newRun, ...prev]);
        setSelectedRun(newRun);
        setIsModalOpen(true);
        setNotice("Generated asset and logged lineage manifest to Backblaze B2.");
      } else {
        setNotice(`Generation Failed: ${data.detail || "Server Error"}`);
      }
    } catch (err) {
      console.error(err);
      setNotice("Error connecting to FastAPI worker service.");
    } finally {
      setBusy("");
    }
  };

  const handleReplayRun = (manifestData) => {
    if (manifestData?.prompt) {
      setPrompt(manifestData.prompt);
    }
    if (manifestData?.provider) {
      setProvider(manifestData.provider);
    }
  };

  const product = (id) => products.find((p) => p.id === id);
  const view = product(viewId);
  const viewLeads = leads.filter((l) => l.product_id === viewId);
  const rankLeads = leads.filter((l) => l.product_id === rankId);

  if (!session)
    return (
      <main className="auth">
        <section>
          <b>✦ BatchBridge & Provenance Studio</b>
          <h1>Find real local buyers & record media lineage.</h1>
          <form onSubmit={auth}>
            <input name="email" type="email" required placeholder="Email" />
            <input
              name="password"
              type="password"
              minLength="8"
              required
              placeholder="Password"
            />
            <button>Sign in</button>
            <button
              type="button"
              onClick={(e) => auth(e.currentTarget.form, true)}
            >
              Create account
            </button>
            <button type="button" onClick={google}>
              Continue with Google
            </button>
          </form>
          <small>{notice}</small>
        </section>
      </main>
    );

  if (!maker?.address)
    return (
      <main className="auth">
        <section>
          <h1>Set up your business</h1>
          <form onSubmit={saveMaker}>
            <input name="name" required placeholder="Business name" />
            <input name="category" required placeholder="What do you make?" />
            <input
              name="address"
              required
              placeholder="Exact address, city and postcode"
            />
            <input name="city" required placeholder="City" />
            <button>Save</button>
          </form>
          <small>{notice}</small>
        </section>
      </main>
    );

  return (
    <main className="dashboard">
      <header>
        <div>
          <b>✦ BatchBridge | Provenance Studio</b>
          <p>
            {maker.name} · {maker.city}
          </p>
        </div>
        <button onClick={() => supabase.auth.signOut()}>Log out</button>
      </header>

      <section className="hero">
        <p className="eyebrow">AUTHENTICATED GENERATIVE MEDIA PIPELINE</p>
        <h1>One product. Provenance verified outputs.</h1>
        <small>{notice}</small>
      </section>

      {/* Provenance Generator Section */}
      <section className="provenance-generator" style={{ padding: "1.5rem", background: "rgba(15, 23, 42, 0.6)", borderRadius: "12px", border: "1px solid #1e293b", marginBottom: "2rem" }}>
        <h2>Generate & Verify Provenance Asset</h2>
        <form onSubmit={handleGenerateProvenanceAsset} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.85rem", color: "#94a3b8", display: "block", marginBottom: "0.25rem" }}>
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A high-quality product shoot for regional distribution..."
              rows={3}
              style={{ width: "100%", padding: "0.75rem", background: "#020617", border: "1px solid #334155", borderRadius: "8px", color: "#f8fafc" }}
            />
          </div>

          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "0.85rem", color: "#94a3b8", display: "block", marginBottom: "0.25rem" }}>
                Inference Engine
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                style={{ width: "100%", padding: "0.6rem", background: "#020617", border: "1px solid #334155", borderRadius: "8px", color: "#f8fafc" }}
              >
                <option value="huggingface">Hugging Face (FLUX.1-schnell)</option>
                <option value="gmi_cloud">GMI Cloud Open-Source Worker</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={busy === "generate_asset" || !prompt.trim()}
              style={{ alignSelf: "flex-end", padding: "0.75rem 1.5rem", background: "#4f46e5", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}
            >
              {busy === "generate_asset" ? "Generating & Hashing..." : "Generate & Record Provenance"}
            </button>
          </div>
        </form>

        {/* Gallery Preview of Generated Runs */}
        {runs.length > 0 && (
          <div style={{ marginTop: "1.5rem" }}>
            <h3 style={{ fontSize: "0.9rem", color: "#94a3b8", marginBottom: "0.75rem" }}>Recent Provenance Runs</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem" }}>
              {runs.map((r) => (
                <div
                  key={r.id}
                  onClick={() => {
                    setSelectedRun(r);
                    setIsModalOpen(true);
                  }}
                  style={{ background: "#020617", border: "1px solid #1e293b", borderRadius: "8px", padding: "0.5rem", cursor: "pointer", position: "relative" }}
                >
                  <img src={r.asset_url} alt={r.prompt} style={{ width: "100%", height: "100px", objectFit: "cover", borderRadius: "4px" }} />
                  <span style={{ position: "absolute", top: "8px", right: "8px", background: "rgba(0,0,0,0.8)", color: "#34d399", fontSize: "10px", padding: "2px 6px", borderRadius: "4px", border: "1px solid #059669" }}>
                    ✓ Verified
                  </span>
                  <p style={{ fontSize: "0.75rem", color: "#cbd5e1", marginTop: "0.5rem", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                    {r.prompt}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="pipeline">
        <article className="step">
          <span>01</span>
          <div>
            <h2>Catalogue</h2>
            <form onSubmit={add}>
              <input name="name" required placeholder="Product" />
              <input name="price" required placeholder="Wholesale price" />
              <input name="capacity" required placeholder="Capacity" />
              <button disabled={busy === "product"}>
                {busy === "product" ? "Adding product…" : "Add product"}
              </button>
            </form>
            <div className="product-catalogue">
              {products.length ? (
                products.map((p) => (
                  <span key={p.id}>
                    <b>{p.name}</b>
                    <small>
                      {p.wholesale_price} · {p.capacity}
                    </small>
                  </span>
                ))
              ) : (
                <p className="muted">No products added yet.</p>
              )}
            </div>
          </div>
        </article>

        <article className="step">
          <span>02</span>
          <div>
            <h2>Discover buyers</h2>
            <select
              value={discoverId}
              onChange={(e) => setDiscoverId(e.target.value)}
            >
              {products.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="actions">
              <button
                disabled={!discoverId || busy === "discover"}
                onClick={() => {
                  setViewId(discoverId);
                  locate();
                }}
              >
                {busy === "discover"
                  ? "Searching live map…"
                  : "Use my current location"}
              </button>
              <button
                disabled={!discoverId || busy === "discover"}
                onClick={() => {
                  setViewId(discoverId);
                  api("/api/discover", discoverId, {}, "discover");
                }}
              >
                Search saved address
              </button>
            </div>
          </div>
        </article>

        <article className="step">
          <span>03</span>
          <div>
            <h2>Rank + improve product</h2>
            <select value={rankId} onChange={(e) => setRankId(e.target.value)}>
              {products.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="actions">
              <button
                disabled={!rankLeads.length || busy === "rank"}
                onClick={() => {
                  setViewId(rankId);
                  api("/api/agent/run", rankId, {}, "rank");
                }}
              >
                {busy === "rank"
                  ? "Ranking with Gemini… please wait (up to 60 sec)"
                  : `Rank ${product(rankId)?.name}`}
              </button>
              {busy === "rank" && (
                <small>
                  Gemini is comparing the discovered buyers. Please do not click
                  again.
                </small>
              )}
              <button
                disabled={!rankId || busy === "advice"}
                onClick={() => api("/api/product-advice", rankId, {}, "advice")}
              >
                Get price + cost ideas
              </button>
            </div>
            {advice && (
              <div className="advice">
                <b>AI product hypotheses</b>
                <p>{advice.price_idea}</p>
                <p>
                  <b>Reduce own cost:</b> {advice.margin_actions?.join(" · ")}
                </p>
                <p>
                  <b>Improve buyer sales:</b>{" "}
                  {advice.buyer_actions?.join(" · ")}
                </p>
                <p>
                  <b>Test:</b> {advice.experiment}
                </p>
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="results">
        <p className="eyebrow">BUYER MAP + LIST</p>
        {viewLeads.length ? (
          <>
            <h2>
              {view.name}: {viewLeads.length} nearby businesses
            </h2>
            <Map
              maker={maker}
              leads={viewLeads}
              title={`${view.name} buyer map`}
            />
            <div className="list">
              {viewLeads.map((l, index) => (
                <article key={l.id}>
                  <b>
                    #{index + 1} · {l.business_name}
                  </b>
                  <span>AI fit score: {l.score}/100</span>
                  <p>{l.rationale}</p>
                  <a href={l.source_url} target="_blank" rel="noreferrer">
                    OpenStreetMap source ↗
                  </a>
                  <div className="actions">
                    <details>
                      <summary>Read tailored AI draft</summary>
                      <p>
                        {l.outreach_draft ||
                          "Rank this buyer to generate a tailored draft."}
                      </p>
                    </details>
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(l.outreach_draft || "")
                      }
                    >
                      Copy tailored AI draft
                    </button>
                    <a
                      className="message"
                      target="_blank"
                      rel="noreferrer"
                      href={`https://wa.me/?text=${encodeURIComponent(
                        l.outreach_draft || ""
                      )}`}
                    >
                      Open WhatsApp
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <h2>Discover buyers for a product to view its map.</h2>
        )}
      </section>

      {/* Provenance Modal Inspector */}
      <ProvenanceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        runData={selectedRun}
        onReplay={handleReplayRun}
      />
    </main>
  );
}