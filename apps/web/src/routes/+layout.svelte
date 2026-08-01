<script lang="ts">
  let { children } = $props();
</script>

{@render children()}

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
    background-color: #f0f2f5;
  }
</style>
