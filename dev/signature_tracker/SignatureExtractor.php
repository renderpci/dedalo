<?php declare(strict_types=1);
/**
 * SignatureExtractor
 * Extracts PHP class/method signatures using reflection
 * For tracking breaking changes in public/protected APIs
 *
 * @package Tools
 * @subpackage SignatureTracker
 */

class SignatureExtractor {

    /**
     * CLASSES_TO_TRACK
     * Critical classes whose signatures should be monitored
     */
    private static array $classes_to_track = [
        // Core API classes
        'dd_diffusion_api',
        'dd_utils_api',
        'dd_core_api',
        'dd_area_maintenance_api',

        // Core components (base classes)
        'component_common',
        'component_string_common',
        'component_number_common',
        'component_media_common',

        // Core system classes
        'search',
        'section',
        'ontology_node',
        'ontology_cache',

        // Diffusion system
        'diffusion_chain_processor',
        'diffusion_utils',
        'diffusion',

        // Data management
        'matrix_common',
        'matrix_table',
        'RecordDataBoundObject',

        // Cache and optimization
        'dd_cache',
        'dd_init',

        // Common utilities
        'common',
        'dd_date',
        'dd_object',
        'locator',
        'filter',
    ];

    /**
     * EXCLUDE_METHODS
     * Methods to exclude from signature tracking (magic methods, internals)
     */
    private const EXCLUDE_METHODS = [
        '__construct',
        '__destruct',
        '__clone',
        '__sleep',
        '__wakeup',
        '__toString',
        '__invoke',
        '__set_state',
        '__debugInfo',
        '__serialize',
        '__unserialize',
        '__get',
        '__set',
        '__isset',
        '__unset',
        '__call',
        '__callStatic',
    ];

    /**
     * BASE_PATH
     * Base directory for class loading
     */
    private string $base_path;

    /**
     * Constructor
     * @param string|null $base_path Optional custom base path
     */
    public function __construct(?string $base_path = null) {
        $this->base_path = $base_path ?? DEDALO_CORE_PATH;
    }

    /**
     * EXTRACT_ALL_SIGNATURES
     * Extract signatures for all tracked classes
     *
     * @return array Signature data for all tracked classes
     */
    public function extractAllSignatures(): array {
        $signatures = [];

        foreach (self::$classes_to_track as $class_name) {
            $class_signature = $this->extractClassSignature($class_name);
            if ($class_signature !== null) {
                $signatures[$class_name] = $class_signature;
            }
        }

        return $signatures;
    }

    /**
     * EXTRACT_CLASS_SIGNATURE
     * Extract signature for a single class
     *
     * @param string $class_name Name of the class
     * @return array|null Class signature data or null if class not found
     */
    public function extractClassSignature(string $class_name): ?array {
        if (!class_exists($class_name)) {
            // Try to load the class file
            $this->autoloadClass($class_name);
        }

        if (!class_exists($class_name)) {
            return null;
        }

        try {
            $reflection = new ReflectionClass($class_name);
        } catch (ReflectionException $e) {
            return null;
        }

        echo "Processing class: $class_name\n";

        $interfaces = $reflection->getInterfaces();
        echo "  Interfaces: " . count($interfaces) . "\n";
        
        $traits = $reflection->getTraits();
        echo "  Traits: " . count($traits) . "\n";

        $parent = $reflection->getParentClass();
        
        return [
            'name' => $class_name,
            'file' => $reflection->getFileName(),
            'parent' => $parent === false ? null : $parent?->getName(),
            'interfaces' => array_values(array_filter(array_map(
                fn($i) => $i instanceof ReflectionNamedType ? $i->getName() : null,
                $reflection->getInterfaces()
            ))),
            'traits' => array_values(array_filter(array_map(
                fn($t) => $t instanceof ReflectionNamedType ? $t->getName() : null,
                $reflection->getTraits()
            ))),
            'constants' => $this->extractConstants($reflection),
            'properties' => $this->extractProperties($reflection),
            'methods' => $this->extractMethods($reflection),
            'timestamp' => date('Y-m-d H:i:s'),
        ];
    }

    /**
     * EXTRACT_CONSTANTS
     * Extract class constants with their values/types
     *
     * @param ReflectionClass $reflection Class reflection
     * @return array Constants data
     */
    private function extractConstants(ReflectionClass $reflection): array {
        $constants = [];

        foreach ($reflection->getReflectionConstants() as $constant) {
            // Only track public constants (protected/private are implementation details)
            if (!$constant->isPublic()) {
                continue;
            }

            $value = $constant->getValue();
            $constants[$constant->getName()] = [
                'type' => $this->getTypeName($value),
                'visibility' => $this->getVisibility($constant),
            ];
        }

        return $constants;
    }

    /**
     * EXTRACT_PROPERTIES
     * Extract class properties with their types and visibility
     *
     * @param ReflectionClass $reflection Class reflection
     * @return array Properties data
     */
    private function extractProperties(ReflectionClass $reflection): array {
        $properties = [];

        foreach ($reflection->getProperties() as $property) {
            echo "  Property: " . $property->getName() . "\n";
            
            // Skip inherited private properties
            $declaring_class = $property->getDeclaringClass();
            if ($declaring_class === false || $declaring_class->getName() !== $reflection->getName()) {
                continue;
            }

            // Only track public/protected properties
            if (!$property->isPublic() && !$property->isProtected()) {
                continue;
            }

            $type = $property->getType();
            
            $properties[$property->getName()] = [
                'type' => $type ? $this->formatType($type) : 'mixed',
                'visibility' => $this->getVisibility($property),
                'static' => $property->isStatic(),
                'default_value' => null,
            ];
        }

        return $properties;
    }

    /**
     * EXTRACT_METHODS
     * Extract class methods with their signatures
     *
     * @param ReflectionClass $reflection Class reflection
     * @return array Methods data
     */
    private function extractMethods(ReflectionClass $reflection): array {
        $methods = [];

        foreach ($reflection->getMethods() as $method) {
            // Skip inherited private methods
            $declaring_class = $method->getDeclaringClass();
            if ($declaring_class === false || $declaring_class->getName() !== $reflection->getName()) {
                continue;
            }

            // Skip excluded methods (magic methods, etc.)
            if (in_array($method->getName(), self::EXCLUDE_METHODS, true)) {
                continue;
            }

            // Only track public/protected methods (private are implementation details)
            if (!$method->isPublic() && !$method->isProtected()) {
                continue;
            }

            $methods[$method->getName()] = [
                'visibility' => $this->getVisibility($method),
                'static' => $method->isStatic(),
                'abstract' => $method->isAbstract(),
                'final' => $method->isFinal(),
                'return_type' => $this->extractReturnType($method),
                'parameters' => $this->extractParameters($method),
            ];
        }

        return $methods;
    }

    /**
     * EXTRACT_RETURN_TYPE
     * Extract method return type information
     *
     * @param ReflectionMethod $method Method reflection
     * @return array Return type data
     */
    private function extractReturnType(ReflectionMethod $method): array {
        $type = $method->getReturnType();

        if ($type === null || $type === false) {
            return [
                'type' => 'mixed',
                'nullable' => true,
            ];
        }

        return [
            'type' => $this->formatType($type),
            'nullable' => $type->allowsNull(),
        ];
    }

    /**
     * EXTRACT_PARAMETERS
     * Extract method parameter information
     *
     * @param ReflectionMethod $method Method reflection
     * @return array Parameters data
     */
    private function extractParameters(ReflectionMethod $method): array {
        $parameters = [];

        foreach ($method->getParameters() as $param) {
            $type = $param->getType();
            
            $param_data = [
                'name' => $param->getName(),
                'type' => $type ? $this->formatType($type) : 'mixed',
                'nullable' => $type && $type->allowsNull(),
                'optional' => $param->isOptional(),
                'by_reference' => $param->isPassedByReference(),
                'variadic' => $param->isVariadic(),
            ];

            // Only indicate if default exists, don't store actual value (may be sensitive/object)
            $param_data['has_default'] = $param->isOptional() && $param->isDefaultValueAvailable();

            $parameters[] = $param_data;
        }

        return $parameters;
    }

    /**
     * FORMAT_TYPE
     * Format reflection type as string representation
     *
     * @param ReflectionType|false $type Type to format
     * @return string Formatted type
     */
    private function formatType(ReflectionType|false $type): string {
        if ($type === false) {
            return 'mixed';
        }

        if ($type instanceof ReflectionUnionType) {
            $types = [];
            foreach ($type->getTypes() as $t) {
                if ($t === false) {
                    $types[] = 'mixed';
                } elseif ($t instanceof ReflectionNamedType) {
                    $types[] = $t->getName();
                } elseif ($t instanceof ReflectionType) {
                    $types[] = $this->formatType($t);
                } else {
                    $types[] = 'mixed';
                }
            }
            return implode('|', $types);
        }

        if ($type instanceof ReflectionNamedType) {
            return $type->getName();
        }

        if ($type instanceof ReflectionIntersectionType) {
            $types = [];
            foreach ($type->getTypes() as $t) {
                if ($t === false) {
                    $types[] = 'mixed';
                } elseif ($t instanceof ReflectionNamedType) {
                    $types[] = $t->getName();
                } elseif ($t instanceof ReflectionType) {
                    $types[] = $this->formatType($t);
                } else {
                    $types[] = 'mixed';
                }
            }
            return implode('&', $types);
        }

        return 'mixed';
    }

    /**
     * GET_VISIBILITY
     * Get visibility string for reflection element
     *
     * @param ReflectionClassConstant|ReflectionProperty|ReflectionMethod $element
     * @return string 'public', 'protected', or 'private'
     */
    private function getVisibility(
        ReflectionClassConstant|ReflectionProperty|ReflectionMethod $element
    ): string {
        if ($element->isPublic()) {
            return 'public';
        }
        if ($element->isProtected()) {
            return 'protected';
        }
        return 'private';
    }

    /**
     * GET_TYPE_NAME
     * Get type name for a value
     *
     * @param mixed $value Value to check
     * @return string Type name
     */
    private function getTypeName(mixed $value): string {
        return gettype($value);
    }

    /**
     * AUTOLOAD_CLASS
     * Attempt to autoload a class by guessing its file path
     *
     * @param string $class_name Class name to load
     * @return bool True if successfully loaded
     */
    private function autoloadClass(string $class_name): bool {
        // Common patterns for Dédalo classes
        $patterns = [
            // component_model -> component_model/class.component_model.php
            "{$this->base_path}/{$class_name}/class.{$class_name}.php",
            // dd_api -> api/v1/common/class.dd_api.php
            "{$this->base_path}/api/v1/common/class.{$class_name}.php",
            // class.component_common -> component_common/class.component_common.php
            "{$this->base_path}/component_common/class.component_common.php",
            // search -> search/class.search.php
            "{$this->base_path}/search/class.search.php",
            // section -> section/class.section.php
            "{$this->base_path}/section/class.section.php",
            // matrix_common -> db/class.matrix_common.php
            "{$this->base_path}/db/class.matrix_common.php",
            // ontology_node -> ontology/class.ontology_node.php
            "{$this->base_path}/ontology/class.{$class_name}.php",
            // common -> base/class.common.php or common/class.common.php
            "{$this->base_path}/base/class.common.php",
            "{$this->base_path}/common/class.common.php",
            // dd_cache -> base/class.dd_cache.php
            "{$this->base_path}/base/class.{$class_name}.php",
            // diffusion -> ../diffusion/class.diffusion.php
            str_replace('/core', '/diffusion', $this->base_path) . "/class.{$class_name}.php",
        ];

        foreach ($patterns as $file) {
            if (file_exists($file)) {
                include_once $file;
                if (class_exists($class_name)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * GET_TRACKED_CLASSES
     * Get list of classes being tracked
     *
     * @return array Class names
     */
    public function getTrackedClasses(): array {
        return self::$classes_to_track;
    }

    /**
     * ADD_TRACKED_CLASS
     * Add a class to the tracking list (for dynamic configuration)
     *
     * @param string $class_name Class to add
     * @return void
     */
    public function addTrackedClass(string $class_name): void {
        if (!in_array($class_name, self::$classes_to_track, true)) {
            self::$classes_to_track[] = $class_name;
        }
    }

}//end SignatureExtractor
