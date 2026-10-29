package org.cqframework.cql.cql2elm

import java.io.ByteArrayInputStream
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotSame
import kotlin.test.assertSame
import kotlin.test.assertTrue
import kotlinx.io.Source
import kotlinx.io.asSource
import kotlinx.io.buffered
import org.cqframework.cql.cql2elm.model.CompiledLibrary
import org.cqframework.cql.cql2elm.quick.FhirLibrarySourceProvider
import org.cqframework.cql.cql2elm.quick.FhirModelInfoProvider
import org.cqframework.cql.cql2elm.utils.getTranslatorVersion
import org.hl7.cql.model.NamespaceInfo
import org.hl7.cql.model.SystemModelInfoProvider
import org.hl7.elm.r1.VersionedIdentifier
import org.junit.jupiter.api.Test

internal class NormalizedSourceCacheTests {
    private fun id(system: String = "urn:requested", version: String = "1.0.0") =
        VersionedIdentifier().withId("Helper").withVersion(version).withSystem(system)

    private class SourceProvider : LibrarySourceProvider {
        var opened = 0
        var closed = 0
        var normalize = true
        var failClose = false
        var body = "define X: true"

        override fun getLibrarySource(libraryIdentifier: VersionedIdentifier): Source? {
            if (libraryIdentifier.id != "Helper") return null
            opened++
            if (normalize) libraryIdentifier.system = "urn:resolved"
            val text = "library Helper version '${libraryIdentifier.version ?: "1.0.0"}'\n$body"
            return object : ByteArrayInputStream(text.toByteArray(Charsets.UTF_8)) {
                    override fun close() {
                        closed++
                        super.close()
                        if (failClose) error("source close failure")
                    }
                }
                .asSource()
                .buffered()
        }
    }

    private fun models() =
        ModelManager().apply {
            modelInfoLoader.registerModelInfoProvider(SystemModelInfoProvider())
            modelInfoLoader.registerModelInfoProvider(FhirModelInfoProvider())
        }

    private fun manager(
        provider: SourceProvider,
        cache: MutableMap<VersionedIdentifier, CompiledLibrary> = mutableMapOf(),
        before: LibrarySourceProvider? = null,
    ): LibraryManager {
        val manager = LibraryManager(models(), CqlCompilerOptions(), cache)
        manager.namespaceManager.ensureNamespaceRegistered(
            NamespaceInfo("requested", "urn:requested")
        )
        manager.namespaceManager.ensureNamespaceRegistered(
            NamespaceInfo("resolved", "urn:resolved")
        )
        if (before != null) manager.librarySourceLoader.registerProvider(before)
        manager.librarySourceLoader.registerProvider(provider)
        return manager
    }

    @Test
    fun normalizedHitKeepsCallerStateAndClosesUnusedSource() {
        val provider = SourceProvider()
        val manager = manager(provider)
        val firstId = id()
        val first = manager.resolveLibrary(firstId)
        val nextId = id()
        assertSame(first, manager.resolveLibrary(nextId))
        assertEquals("urn:resolved", firstId.system)
        assertEquals(firstId, nextId)
        assertEquals(2, provider.opened)
        assertEquals(2, provider.closed)
        assertEquals(1, manager.compiledLibraries.size)
        assertSame(first, manager.resolveLibrary(id("urn:resolved")))
        assertEquals(2, provider.opened, "Exact cache hits must not fetch source")
    }

    @Test
    fun cacheModesRemainDistinct() {
        val provider = SourceProvider()
        val manager = manager(provider)
        val first = manager.resolveLibrary(id())
        assertSame(first, manager.resolveLibrary(id(), LibraryManager.CacheMode.READ_ONLY))
        assertNotSame(first, manager.resolveLibrary(id(), LibraryManager.CacheMode.NONE))
        assertSame(first, manager.compiledLibraries[id("urn:resolved")])
        assertEquals(1, manager.compiledLibraries.size)
        val unspecifiedId = id().withVersion(null)
        val unspecified = manager.resolveLibrary(unspecifiedId, LibraryManager.CacheMode.READ_ONLY)
        assertNotSame(first, unspecified, "A concrete cached version must not satisfy a null key")
        assertEquals(null, unspecifiedId.version)
        assertEquals(1, manager.compiledLibraries.size)
        val other =
            manager.resolveLibrary(id(version = "2.0.0"), LibraryManager.CacheMode.READ_ONLY)
        assertEquals("2.0.0", other.identifier!!.version)
        assertEquals(1, manager.compiledLibraries.size, "READ_ONLY miss must not write")
        assertNotSame(first, manager.resolveLibrary(id(version = "2.0.0")))
        assertEquals(2, manager.compiledLibraries.size)
        assertEquals(provider.opened, provider.closed)
    }

    @Test
    fun sourceChoiceStillPrecedesNormalizedCacheChoice() {
        val provider = SourceProvider()
        val manager = manager(provider)
        val core = manager.resolveLibrary(id())
        provider.normalize = false
        val authoredId = id()
        val authored = manager.resolveLibrary(authoredId)
        assertNotSame(core, authored)
        assertEquals("urn:requested", authoredId.system)
        assertEquals(2, manager.compiledLibraries.size)
        assertSame(core, manager.resolveLibrary(id("urn:resolved")))
        var misses = 0
        val mutatingMiss =
            object : LibrarySourceProvider {
                override fun getLibrarySource(libraryIdentifier: VersionedIdentifier): Source? {
                    if (libraryIdentifier.id == "Helper") {
                        misses++
                        libraryIdentifier.system = "urn:resolved"
                    }
                    return null
                }
            }
        val fallback = SourceProvider().apply { normalize = false }
        val withMiss = this.manager(fallback, before = mutatingMiss)
        val fromFallback = withMiss.resolveLibrary(id())
        assertSame(fromFallback, withMiss.resolveLibrary(id()))
        assertEquals(2, misses)
        assertEquals(fallback.opened, fallback.closed)
    }

    @Test
    fun cacheKeysAreIndependentOfTheCallersMutableIdentifier() {
        val provider = SourceProvider()
        val manager = manager(provider)
        val request = id()
        val first = manager.resolveLibrary(request)
        assertNotSame(request, manager.compiledLibraries.keys.single())
        request.system = "urn:changed"
        request.version = "9.0.0"
        assertSame(first, manager.compiledLibraries[id("urn:resolved")])
        assertSame(first, manager.resolveLibrary(id()))
        assertEquals(1, manager.compiledLibraries.size)
    }

    @Test
    fun sourceIsClosedOnLookupAndCloseFailures() {
        val provider = SourceProvider()
        var failLookup = false
        val cache =
            object : HashMap<VersionedIdentifier, CompiledLibrary>() {
                override fun get(key: VersionedIdentifier): CompiledLibrary? {
                    if (failLookup && key.system == "urn:resolved") error("cache lookup failure")
                    return super.get(key)
                }
            }
        val manager = manager(provider, cache)
        manager.resolveLibrary(id())
        failLookup = true
        assertFailsWith<IllegalStateException> { manager.resolveLibrary(id()) }
        assertEquals(provider.opened, provider.closed)
        failLookup = false
        provider.failClose = true
        assertFailsWith<IllegalStateException> { manager.resolveLibrary(id()) }
        assertEquals(provider.opened, provider.closed)
        provider.failClose = false
        provider.body = "define"
        val failedId = id(version = "3.0.0")
        val errors = mutableListOf<CqlCompilerException>()
        val failed = runCatching { manager.resolveLibrary(failedId, errors) }
        assertTrue(failed.isFailure || CqlCompilerException.hasErrors(errors))
        assertEquals("urn:resolved", failedId.system, "Keep existing cold-failure normalization")
        assertFalse(manager.compiledLibraries.containsKey(id("urn:resolved", "3.0.0")))
        assertEquals(1, manager.compiledLibraries.size)
        assertEquals(provider.opened, provider.closed)
    }

    @Test
    fun mixedIncludesRetainTheirColdCanonicalPaths() {
        val provider = SourceProvider()
        val manager = manager(provider)
        val text =
            """
            library Caller version '1.0.0'
            include requested.Helper version '1.0.0' called Qualified
            include resolved.Helper version '1.0.0' called Canonical
            define Result: Qualified.X and Canonical.X
        """
                .trimIndent()
        fun paths(): List<String?> {
            val translated = CqlTranslator.fromText(text, manager)
            assertTrue(translated.errors.isEmpty(), translated.errors.toString())
            return translated.toELM()!!.includes!!.def.map { it.path }
        }
        val cold = paths()
        assertEquals(listOf("urn:resolved/Helper", "urn:resolved/Helper"), cold)
        assertEquals(cold, paths())
        assertEquals(provider.opened, provider.closed)
    }

    @Test
    fun successfulWarningCompilationUsesExistingCacheDiagnosticContract() {
        val provider = SourceProvider()
        provider.body = "define X: 10000 '[IU]/mL' > 5000 '[IU]/mL'"
        val manager = manager(provider)
        val cold = mutableListOf<CqlCompilerException>()
        val first = manager.resolveLibrary(id(), cold)
        assertFalse(CqlCompilerException.hasErrors(cold))
        assertTrue(cold.any { it.message!!.contains("arbitrary") })
        val warm = mutableListOf<CqlCompilerException>()
        assertSame(first, manager.resolveLibrary(id(), warm))
        assertTrue(warm.isEmpty(), "Cached libraries do not replay compile diagnostics")
    }

    @Test
    fun actualBuiltinKeepsItsNamespaceAndIdentityOnWarmLookup() {
        assertEquals("5.3.0", getTranslatorVersion(), "Keep ELM compatibility unchanged")
        val manager = LibraryManager(models())
        manager.namespaceManager.ensureNamespaceRegistered(
            NamespaceInfo("hl7.fhir.uv.cql", "http://hl7.org/fhir/uv/cql")
        )
        manager.librarySourceLoader.registerProvider(FhirLibrarySourceProvider())
        fun helper() =
            VersionedIdentifier()
                .withId("FHIRHelpers")
                .withVersion("4.0.1")
                .withSystem("http://hl7.org/fhir/uv/cql")
        val cold = helper()
        val first = manager.resolveLibrary(cold)
        val warm = helper()
        assertSame(first, manager.resolveLibrary(warm))
        assertEquals("http://hl7.org/fhir", cold.system)
        assertEquals(cold, warm)
        assertEquals(1, manager.compiledLibraries.keys.count { it.id == "FHIRHelpers" })
    }
}
