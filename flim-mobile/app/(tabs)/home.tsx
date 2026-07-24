import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { flimApi } from "@/api/flimApi";
import type { MovieSearchResult } from "@/api/types";
import { flimImages } from "@/assets/flimAssets";
import { CompactSearch } from "@/components/CompactSearch";
import { FlimHero } from "@/components/FlimHero";
import { Header } from "@/components/Header";
import { PosterCard } from "@/components/PosterCard";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState, ErrorState, LoadingHero } from "@/components/StateViews";
import { spacing } from "@/theme/theme";

export default function HomeScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MovieSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setResults(await flimApi.searchTitles(query.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Header />
      <FlimHero
        image={flimImages.homeHero}
        title="What Are We Watching Tonight?"
        subtitle="Search movies and shows, open details, and save titles to your collections."
      >
        <CompactSearch value={query} onChangeText={setQuery} onSubmit={search} placeholder="Search movies, shows, actors, or genres" />
      </FlimHero>
      <View style={styles.section}>
        <SectionHeader title={results.length ? `Results for ${query}` : "Start with a title"} />
        {loading ? <LoadingHero label="Searching Flim..." /> : null}
        {error ? <ErrorState message={error} onRetry={search} /> : null}
        {!loading && !error && !results.length ? <EmptyState title="Search Flim" body="Find a title, open details, and add it to a playlist." /> : null}
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.mediaType}-${item.tmdbId}`}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          renderItem={({ item }) => (
            <PosterCard
              title={item}
              onPress={() => router.push(`/title/${item.mediaType}/${item.tmdbId}`)}
            />
          )}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md
  },
  row: {
    gap: spacing.md,
    paddingRight: spacing.md
  }
});
