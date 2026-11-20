import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/api_service.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../state/auth_state.dart';
import '../widgets/common.dart';
import '../widgets/room_card.dart';
import 'room_detail_screen.dart';

const List<String> kFacilityOptions = [
  'Proyektor',
  'AC',
  'Wi-Fi',
  'Whiteboard',
  'Sound System',
  'Video Conference',
];

/// Filter katalog ruangan.
class RoomFilters {
  RoomFilters({
    this.category,
    this.minCapacity,
    this.facilities = const [],
    this.sort = 'name',
    this.availableDate,
    this.start,
    this.end,
  });

  String? category;
  int? minCapacity;
  List<String> facilities;
  String sort; // name | capacity | popular
  DateTime? availableDate; // tanggal dinding WIB (hanya y/m/d dipakai)
  TimeOfDay? start;
  TimeOfDay? end;

  bool get hasAvailability => availableDate != null && start != null && end != null;

  RoomFilters copy() => RoomFilters(
        category: category,
        minCapacity: minCapacity,
        facilities: List.of(facilities),
        sort: sort,
        availableDate: availableDate,
        start: start,
        end: end,
      );

  int get activeCount =>
      (minCapacity != null ? 1 : 0) +
      facilities.length +
      (sort != 'name' ? 1 : 0) +
      (hasAvailability ? 1 : 0);
}

class RoomsScreen extends StatefulWidget {
  const RoomsScreen({super.key});

  @override
  State<RoomsScreen> createState() => _RoomsScreenState();
}

class _RoomsScreenState extends State<RoomsScreen> {
  final _search = TextEditingController();
  Timer? _debounce;
  RoomFilters _filters = RoomFilters();
  final List<Room> _rooms = [];
  List<RoomCategory> _categories = [];
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  int _page = 1;
  bool _hasMore = false;
  int _total = 0;
  int _seen = -1;
  String? _appliedNavQuery;

  @override
  void initState() {
    super.initState();
    _loadCategories();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final v = context.watch<RefreshState>().version;
    final nav = context.watch<NavState>();
    var reload = false;
    if (v != _seen) {
      _seen = v;
      reload = true;
    }
    // pencarian yang dikirim dari beranda
    if (nav.index == 1 && nav.roomQuery != null && nav.roomQuery != _appliedNavQuery) {
      _appliedNavQuery = nav.roomQuery;
      _search.text = nav.roomQuery!;
      reload = true;
    }
    if (reload) {
      // setState di dalam _load tidak boleh dipanggil saat fase build
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _load();
      });
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _loadCategories() async {
    try {
      final cats = await context.read<ApiService>().categories();
      if (mounted) setState(() => _categories = cats);
    } catch (_) {
      // kategori hanya pelengkap filter
    }
  }

  ({DateTime start, DateTime end})? _window() {
    final f = _filters;
    if (!f.hasAvailability) return null;
    final d = f.availableDate!;
    final s = fromWib(d.year, d.month, d.day, f.start!.hour, f.start!.minute);
    final e = fromWib(d.year, d.month, d.day, f.end!.hour, f.end!.minute);
    return (start: s, end: e);
  }

  Future<void> _load({bool more = false}) async {
    final api = context.read<ApiService>();
    final nextPage = more ? _page + 1 : 1;
    setState(() {
      if (more) {
        _loadingMore = true;
      } else {
        _loading = true;
        _error = null;
      }
    });
    try {
      final q = _search.text.trim();
      final window = _window();
      List<Room> items;
      var total = 0;
      var hasMore = false;
      if (window != null && !window.end.isAfter(window.start)) {
        throw ApiException('Jam selesai harus setelah jam mulai.');
      }
      final result = await api.rooms(
        q: q,
        category: _filters.category,
        minCapacity: _filters.minCapacity,
        facilities: _filters.facilities,
        sort: _filters.sort,
        page: nextPage,
        start: window?.start,
        end: window?.end,
      );
      items = result.items;
      total = result.total;
      hasMore = result.hasMore;
      if (!mounted) return;
      setState(() {
        if (!more) _rooms.clear();
        _rooms.addAll(items);
        _page = nextPage;
        _hasMore = hasMore;
        _total = total;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadingMore = false;
        });
      }
    }
  }

  void _onSearchChanged(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 450), _load);
  }

  Future<void> _openFilters() async {
    final result = await showModalBottomSheet<RoomFilters>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(26))),
      builder: (_) => _FilterSheet(initial: _filters.copy()),
    );
    if (result != null) {
      setState(() => _filters = result);
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
          child: Row(children: [
            const Expanded(
              child: Text('Ruangan',
                  style: TextStyle(fontFamily: AppTheme.serif, fontSize: 30, fontWeight: FontWeight.w600)),
            ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
          child: Row(children: [
            Expanded(
              child: TextField(
                controller: _search,
                onChanged: _onSearchChanged,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: 'Cari nama, kode, atau lokasi',
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: _search.text.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close_rounded),
                          onPressed: () {
                            _search.clear();
                            _load();
                          },
                        ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Badge(
              isLabelVisible: _filters.activeCount > 0,
              label: Text('${_filters.activeCount}'),
              backgroundColor: AppColors.gold,
              textColor: AppColors.primaryDark,
              child: SizedBox(
                width: 54,
                height: 54,
                child: IconButton.filled(
                  tooltip: 'Filter',
                  style: IconButton.styleFrom(
                    backgroundColor: AppColors.primaryDark,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.control)),
                  ),
                  onPressed: _openFilters,
                  icon: const Icon(Icons.tune_rounded),
                ),
              ),
            ),
          ]),
        ),
        SizedBox(
          height: 56,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 6),
            children: [
              _chip('Semua', _filters.category == null, () {
                setState(() => _filters.category = null);
                _load();
              }),
              for (final c in _categories)
                _chip(c.name, _filters.category == c.name, () {
                  setState(() => _filters.category = c.name);
                  _load();
                }),
            ],
          ),
        ),
        if (_filters.hasAvailability)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 6),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(color: AppColors.goldTint, borderRadius: BorderRadius.circular(12)),
              child: Row(children: [
                const Icon(Icons.event_available_outlined, size: 18, color: AppColors.goldDeep),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Tersedia ${fmtWibDate(_filters.availableDate!)} · ${_filters.start!.format(context)}–${_filters.end!.format(context)}',
                    style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.goldDeep),
                  ),
                ),
              ]),
            ),
          ),
        Expanded(child: _body()),
      ]),
    );
  }

  Widget _chip(String label, bool selected, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(
          label: Text(label),
          selected: selected,
          onSelected: (_) => onTap(),
          selectedColor: AppColors.primaryDark,
          labelStyle: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: selected ? Colors.white : AppColors.textPrimary,
          ),
          showCheckmark: false,
          side: const BorderSide(color: AppColors.line),
        ),
      );

  Widget _body() {
    if (_loading) return const ListSkeleton(count: 5, height: 128);
    if (_error != null) return ErrorView(message: _error!, onRetry: _load);
    if (_rooms.isEmpty) {
      return EmptyView(
        icon: Icons.search_off_rounded,
        title: 'Ruangan tidak ditemukan',
        message: 'Coba ubah kata kunci atau longgarkan filter yang dipilih.',
        action: _filters.activeCount > 0 || _filters.category != null || _search.text.isNotEmpty
            ? OutlinedButton(
                style: OutlinedButton.styleFrom(minimumSize: const Size(160, 46)),
                onPressed: () {
                  _search.clear();
                  setState(() => _filters = RoomFilters());
                  _load();
                },
                child: const Text('Reset filter'),
              )
            : null,
      );
    }
    return RefreshIndicator(
      color: AppColors.goldDeep,
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(20, 6, 20, 24),
        itemCount: _rooms.length + 1,
        separatorBuilder: (_, __) => const SizedBox(height: 14),
        itemBuilder: (context, i) {
          if (i == _rooms.length) {
            if (_hasMore) {
              return Padding(
                padding: const EdgeInsets.only(top: 4),
                child: OutlinedButton(
                  onPressed: _loadingMore ? null : () => _load(more: true),
                  child: _loadingMore
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.2))
                      : const Text('Muat lebih banyak'),
                ),
              );
            }
            return Center(
              child: Text('$_total ruangan', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
            );
          }
          final room = _rooms[i];
          return RoomCard(
            room: room,
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => RoomDetailScreen(roomId: room.id)),
            ),
          );
        },
      ),
    );
  }
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({required this.initial});

  final RoomFilters initial;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late RoomFilters f = widget.initial;

  Future<void> _pickDate() async {
    final today = nowWib();
    final picked = await showDatePicker(
      context: context,
      initialDate: f.availableDate ?? DateTime(today.year, today.month, today.day),
      firstDate: DateTime(today.year, today.month, today.day),
      lastDate: DateTime(today.year, today.month, today.day).add(const Duration(days: 90)),
    );
    if (picked != null) {
      setState(() {
        f.availableDate = picked;
        f.start ??= const TimeOfDay(hour: 9, minute: 0);
        f.end ??= const TimeOfDay(hour: 11, minute: 0);
      });
    }
  }

  Future<void> _pickTime(bool isStart) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: (isStart ? f.start : f.end) ?? const TimeOfDay(hour: 9, minute: 0),
    );
    if (picked != null) setState(() => isStart ? f.start = picked : f.end = picked);
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(22, 14, 22, 18 + bottom),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Center(
            child: Container(width: 44, height: 5, decoration: BoxDecoration(color: AppColors.line, borderRadius: BorderRadius.circular(5))),
          ),
          const SizedBox(height: 16),
          Row(children: [
            const Expanded(child: Text('Filter ruangan', style: TextStyle(fontFamily: AppTheme.serif, fontSize: 22, fontWeight: FontWeight.w600))),
            TextButton(onPressed: () => setState(() => f = RoomFilters(category: f.category)), child: const Text('Reset')),
          ]),
          const SizedBox(height: 8),
          const _Label('Kapasitas minimum'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final c in const [null, 10, 20, 50, 100])
              ChoiceChip(
                label: Text(c == null ? 'Semua' : '$c+'),
                selected: f.minCapacity == c,
                onSelected: (_) => setState(() => f.minCapacity = c),
                selectedColor: AppColors.primaryDark,
                labelStyle: TextStyle(color: f.minCapacity == c ? Colors.white : AppColors.textPrimary, fontWeight: FontWeight.w600),
                showCheckmark: false,
              ),
          ]),
          const SizedBox(height: 18),
          const _Label('Fasilitas'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final fac in kFacilityOptions)
              FilterChip(
                label: Text(fac),
                selected: f.facilities.contains(fac),
                onSelected: (on) => setState(() => on ? f.facilities = [...f.facilities, fac] : f.facilities = f.facilities.where((x) => x != fac).toList()),
                selectedColor: AppColors.lightGold,
                checkmarkColor: AppColors.primaryDark,
              ),
          ]),
          const SizedBox(height: 18),
          const _Label('Urutkan'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final s in const [('name', 'Nama A–Z'), ('capacity', 'Kapasitas terbesar'), ('popular', 'Terpopuler')])
              ChoiceChip(
                label: Text(s.$2),
                selected: f.sort == s.$1,
                onSelected: (_) => setState(() => f.sort = s.$1),
                selectedColor: AppColors.primaryDark,
                labelStyle: TextStyle(color: f.sort == s.$1 ? Colors.white : AppColors.textPrimary, fontWeight: FontWeight.w600),
                showCheckmark: false,
              ),
          ]),
          const SizedBox(height: 18),
          Row(children: [
            const Expanded(child: _Label('Ketersediaan pada waktu tertentu')),
            if (f.hasAvailability)
              TextButton(onPressed: () => setState(() {
                    f.availableDate = null;
                    f.start = null;
                    f.end = null;
                  }), child: const Text('Hapus')),
          ]),
          Row(children: [
            Expanded(flex: 3, child: _PickTile(icon: Icons.calendar_today_outlined, text: f.availableDate == null ? 'Tanggal' : fmtWibDate(f.availableDate!), onTap: _pickDate)),
            const SizedBox(width: 8),
            Expanded(flex: 2, child: _PickTile(icon: Icons.schedule, text: f.start?.format(context) ?? 'Mulai', onTap: () => _pickTime(true))),
            const SizedBox(width: 8),
            Expanded(flex: 2, child: _PickTile(icon: Icons.schedule, text: f.end?.format(context) ?? 'Selesai', onTap: () => _pickTime(false))),
          ]),
          const SizedBox(height: 24),
          FilledButton(onPressed: () => Navigator.pop(context, f), child: const Text('Terapkan filter')),
        ]),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
      );
}

class _PickTile extends StatelessWidget {
  const _PickTile({required this.icon, required this.text, required this.onTap});

  final IconData icon;
  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.control),
      child: Container(
        height: 50,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.circular(AppRadius.control),
          border: Border.all(color: AppColors.line),
        ),
        child: Row(children: [
          Icon(icon, size: 16, color: AppColors.goldDeep),
          const SizedBox(width: 6),
          Expanded(child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
        ]),
      ),
    );
  }
}
